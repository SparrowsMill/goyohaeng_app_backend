import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type VisitVerificationStatus =
  | 'ISSUED'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED';

export interface VisitVerification {
  id: number;
  userId: number;
  placeId: number;

  arrivalOptionMinutes: number | null;
  expectedArrivalAt: Date | null;

  verificationCode: string;

  issuedAt: Date;
  expiresAt: Date;

  status: string;

  verifiedAt: Date | null;
  failReason: string | null;

  createdAt: Date;
}

export interface VisitVerificationReward {
  ingredientId: number;
  name: string;
  quantity: number;
  rarity: string | null;
}

export interface VisitVerificationDetail
  extends VisitVerification {
  reward: VisitVerificationReward | null;
}

interface CreateVisitVerificationData {
  placeId: number;
  arrivalOptionMinutes: number;
}

@Injectable()
export class VisitVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
  userId: number,
  dto: CreateVisitVerificationData,
): Promise<VisitVerification> {
  if (
    ![10, 30, 60].includes(
      dto.arrivalOptionMinutes,
    )
  ) {
    throw new BadRequestException(
      '도착 시간은 10분, 30분, 60분 중 하나여야 합니다.',
    );
  }

  /*
   * 장소 + 방문 인증 설정 확인
   */
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(dto.placeId),
        status: 'ACTIVE',
      },

      select: {
        id: true,

        verificationSetting: {
          select: {
            enabled: true,
            hoursMode: true,
            codeValidMinutes: true,
          },
        },
      },
    });

  if (!place) {
    throw new BadRequestException(
      '장소를 찾을 수 없습니다.',
    );
  }

  if (
    !place.verificationSetting ||
    !place.verificationSetting.enabled
  ) {
    throw new BadRequestException(
      '현재 방문 인증을 신청할 수 없는 장소입니다.',
    );
  }

  const issuedAt = new Date();

  const expectedArrivalAt =
    new Date(
      issuedAt.getTime() +
        dto.arrivalOptionMinutes *
          60 *
          1000,
    );

  /*
   * 사용자가 선택한 예상 도착 시각이
   * 실제 방문 인증 가능시간인지 확인
   */
  const available =
    await this.isVerificationAvailableAt(
      dto.placeId,
      place.verificationSetting.hoursMode,
      expectedArrivalAt,
    );

  if (!available) {
    throw new BadRequestException(
      '선택한 도착 시간에는 방문 인증을 신청할 수 없습니다.',
    );
  }

  /*
   * 이미 만료된 기존 세션 정리
   */
  await this.prisma.visitVerification.updateMany({
    where: {
      userId: BigInt(userId),
      placeId: BigInt(dto.placeId),

      status: 'ISSUED',

      expiresAt: {
        lte: issuedAt,
      },
    },

    data: {
      status: 'EXPIRED',

      failReason:
        '인증 시간이 만료되었습니다.',
    },
  });

  /*
   * 같은 사용자가 같은 장소에
   * 아직 유효한 방문 인증을 가지고 있다면
   * 중복 신청 방지
   */
  const existingVerification =
    await this.prisma.visitVerification.findFirst({
      where: {
        userId: BigInt(userId),
        placeId: BigInt(dto.placeId),

        status: 'ISSUED',

        expiresAt: {
          gt: issuedAt,
        },
      },

      select: {
        id: true,
      },
    });

  if (existingVerification) {
    throw new BadRequestException(
      '이미 진행 중인 방문 인증이 있습니다.',
    );
  }

  /*
   * 예상 도착 시각 이후에도
   * codeValidMinutes만큼 인증 가능
   */
  const expiresAt =
    new Date(
      expectedArrivalAt.getTime() +
        place.verificationSetting
          .codeValidMinutes *
          60 *
          1000,
    );

  /*
   * 해당 장소의 현재 유효 세션과
   * 겹치지 않는 6자리 코드 생성
   */
  const verificationCode =
    await this.generateUniqueVerificationCode(
      dto.placeId,
    );

  const verification =
    await this.prisma.visitVerification.create({
      data: {
        userId:
          BigInt(userId),

        placeId:
          BigInt(dto.placeId),

        arrivalOptionMinutes:
          dto.arrivalOptionMinutes,

        expectedArrivalAt,

        verificationCode,

        issuedAt,

        expiresAt,

        status: 'ISSUED',
      },
    });

  return this.toVisitVerification(
    verification,
  );
}

  async findById(
  userId: number,
  id: number,
): Promise<
  VisitVerificationDetail | undefined
> {
  let verification =
    await this.prisma.visitVerification.findFirst({
      where: {
        id: BigInt(id),
        userId: BigInt(userId),
      },
    });

  if (!verification) {
    return undefined;
  }

  /*
   * 아직 ISSUED 상태인데
   * 만료 시간이 지났다면 EXPIRED 처리
   */
  if (
    verification.status === 'ISSUED' &&
    new Date() > verification.expiresAt
  ) {
    verification =
      await this.prisma.visitVerification.update({
        where: {
          id: verification.id,
        },

        data: {
          status: 'EXPIRED',
          failReason:
            '인증 시간이 만료되었습니다.',
        },
      });
  }

  const baseVerification =
    this.toVisitVerification(
      verification,
    );

  /*
   * VERIFIED가 아니면
   * 아직 지급된 방문 보상이 없다.
   */
  if (
    verification.status !== 'VERIFIED'
  ) {
    return {
      ...baseVerification,
      reward: null,
    };
  }

  /*
   * 관리자 승인 과정에서 생성된
   * VISIT_REWARD 지급 이력 조회
   */
  const rewardTransaction =
    await this.prisma
      .ingredientTransaction
      .findFirst({
        where: {
          visitVerificationId:
            verification.id,

          transactionType:
            'VISIT_REWARD',
        },

        orderBy: {
          id: 'desc',
        },

        select: {
          ingredientId: true,
          quantityChange: true,

          ingredient: {
            select: {
              name: true,
              rarity: true,
            },
          },
        },
      });

  return {
    ...baseVerification,

    reward:
      rewardTransaction === null
        ? null
        : {
            ingredientId:
              Number(
                rewardTransaction
                  .ingredientId,
              ),

            name:
              rewardTransaction
                .ingredient.name,

            quantity:
              rewardTransaction
                .quantityChange,

            rarity:
              rewardTransaction
                .ingredient.rarity,
          },
  };
}


  async cancel(
  userId: number,
  id: number,
): Promise<
  VisitVerification | undefined
> {
  const verification =
    await this.prisma.visitVerification.findFirst({
      where: {
        id: BigInt(id),
        userId: BigInt(userId),
      },
    });

  if (!verification) {
    return undefined;
  }

  /*
   * 아직 ISSUED이지만 이미 만료된 경우
   */
  if (
    verification.status === 'ISSUED' &&
    new Date() > verification.expiresAt
  ) {
    await this.prisma.visitVerification.update({
      where: {
        id: verification.id,
      },

      data: {
        status: 'EXPIRED',
        failReason:
          '인증 시간이 만료되었습니다.',
      },
    });

    throw new BadRequestException(
      '이미 만료된 방문 인증입니다.',
    );
  }

  /*
   * 대기 중인 인증만 취소 가능
   */
  if (
    verification.status !== 'ISSUED'
  ) {
    throw new BadRequestException(
      '이미 처리된 방문 인증은 취소할 수 없습니다.',
    );
  }

  /*
   * 동시에 관리자 승인 등이 들어올 수 있으므로
   * ISSUED 조건을 다시 걸어 원자적으로 변경
   */
  const result =
    await this.prisma.visitVerification.updateMany({
      where: {
        id: verification.id,
        userId: verification.userId,
        status: 'ISSUED',
      },

      data: {
        status: 'CANCELLED',
        verifiedAt: null,
        failReason:
          '사용자가 방문 인증을 취소했습니다.',
      },
    });

  if (result.count !== 1) {
    throw new BadRequestException(
      '이미 처리된 방문 인증입니다.',
    );
  }

  const updated =
    await this.prisma.visitVerification.findUnique({
      where: {
        id: verification.id,
      },
    });

  if (!updated) {
    return undefined;
  }

  return this.toVisitVerification(
    updated,
  );
}

  /*
   * 관리자 웹에서 방문 인증 승인
   *
   * placeId는 프론트에서 받는 값이 아니라
   * 로그인한 관리자 BusinessAccount의
   * placeId를 사용한다.
   */
  async approveByBusiness(
    placeId: number,
    id: number,
  ): Promise<
    VisitVerification | undefined
  > {
    /*
     * 해당 관리자의 장소에 속한
     * 방문 인증 세션인지 확인
     */
    const verification =
      await this.prisma.visitVerification
        .findFirst({
          where: {
            id: BigInt(id),

            placeId:
              BigInt(placeId),
          },
        });

    if (!verification) {
      return undefined;
    }

    /*
     * 아직 ISSUED인데
     * 만료 시간이 이미 지난 경우
     */
    if (
      verification.status ===
        'ISSUED' &&
      new Date() >
        verification.expiresAt
    ) {
      await this.prisma
        .visitVerification
        .update({
          where: {
            id:
              verification.id,
          },

          data: {
            status: 'EXPIRED',

            failReason:
              '인증 시간이 만료되었습니다.',
          },
        });

      throw new BadRequestException(
        '인증 시간이 만료되었습니다.',
      );
    }

    /*
     * 대기 중인 방문 인증만
     * 관리자가 승인 가능
     */
    if (
      verification.status !==
      'ISSUED'
    ) {
      throw new BadRequestException(
        '이미 처리된 방문 인증입니다.',
      );
    }

    const now = new Date();

    /*
     * 인증 완료 + GAP 보상 지급을
     * 하나의 transaction으로 처리
     *
     * 보상 지급 과정에서 문제가 생기면
     * VERIFIED 변경도 같이 rollback된다.
     */
    const updatedVerification =
      await this.prisma.$transaction(
        async (tx) => {
          /*
           * ISSUED → VERIFIED
           *
           * placeId와 status를 함께 조건으로 걸어서
           * 다른 장소 관리자가 처리할 수 없도록 하고
           * 중복 승인도 막는다.
           */
          const updateResult =
            await tx.visitVerification
              .updateMany({
                where: {
                  id:
                    verification.id,

                  placeId:
                    BigInt(placeId),

                  status:
                    'ISSUED',
                },

                data: {
                  status:
                    'VERIFIED',

                  verifiedAt:
                    now,

                  failReason:
                    null,
                },
              });

          if (
            updateResult.count !== 1
          ) {
            throw new BadRequestException(
              '이미 처리된 방문 인증입니다.',
            );
          }

          /*
           * 동일 방문 인증으로
           * VISIT_REWARD가 이미 지급됐는지 확인
           */
          const existingReward =
            await tx
              .ingredientTransaction
              .findFirst({
                where: {
                  visitVerificationId:
                    verification.id,

                  transactionType:
                    'VISIT_REWARD',
                },

                select: {
                  id: true,
                },
              });

          if (existingReward) {
            throw new BadRequestException(
              '이미 재료 보상이 지급된 방문 인증입니다.',
            );
          }

          /*
 * 모든 GAP API와 동일한 기준으로
 * 최신 production GAP run 조회
 *
 * formulaVersion = GAP_V1_PROXY
 * dataStage = COLD_START
 */
const latestRun =
  await tx.gapScoreRun.findFirst({
    where: {
      formulaVersion:
        'GAP_V1_PROXY',

      dataStage:
        'COLD_START',

      scores: {
        some: {},
      },
    },

    orderBy: [
      {
        calculatedAt:
          'desc',
      },
      {
        id:
          'desc',
      },
    ],

    select: {
      id: true,
    },
  });

/*
 * 장소별 최신 history가 아니라
 * 선택된 production run 안의 GAP percentile만 사용
 */
const latestGap =
  latestRun
    ? await tx.gapScoreHistory.findFirst({
        where: {
          runId:
            latestRun.id,

          placeId:
            verification.placeId,
        },

        select: {
          gapPercentile:
            true,
        },
      })
    : null;

const gapPercentile =
  latestGap
    ?.gapPercentile ===
      null ||
  latestGap
    ?.gapPercentile ===
      undefined
    ? null
    : Number(
        latestGap
          .gapPercentile,
      );

          /*
           * 활성화된 드랍 정책 조회
           */
          const policies =
            await tx
              .ingredientDropPolicy
              .findMany({
                where: {
                  isActive: true,
                },
              });

          let selectedPolicy:
            | (typeof policies)[number]
            | undefined;

          /*
           * GAP 데이터가 없으면
           * NO_GAP 정책 사용
           */
          if (
            gapPercentile === null
          ) {
            selectedPolicy =
              policies.find(
                (policy) =>
                  policy.code ===
                  'NO_GAP',
              );
          } else {
            /*
             * 해당 GAP percentile이 속하는
             * 정책 구간 검색
             *
             * 기본:
             * min <= percentile < max
             *
             * percentile이 정확히 1이면
             * max = 1인 마지막 구간에 포함
             */
            selectedPolicy =
              policies.find(
                (policy) => {
                  if (
                    policy.code ===
                      'NO_GAP' ||
                    policy
                      .minGapPercentile ===
                      null ||
                    policy
                      .maxGapPercentile ===
                      null
                  ) {
                    return false;
                  }

                  const min =
                    Number(
                      policy
                        .minGapPercentile,
                    );

                  const max =
                    Number(
                      policy
                        .maxGapPercentile,
                    );

                  return (
                    gapPercentile >=
                      min &&
                    (
                      gapPercentile <
                        max ||
                      (
                        gapPercentile ===
                          1 &&
                        max === 1
                      )
                    )
                  );
                },
              );
          }

          if (!selectedPolicy) {
            throw new BadRequestException(
              '재료 드랍 정책을 찾을 수 없습니다.',
            );
          }

          /*
           * DB에 저장된 확률을 이용해
           * rarity 추첨
           */
          const randomValue =
            Math.random();

          const commonProbability =
            Number(
              selectedPolicy
                .commonProbability,
            );

          const uncommonProbability =
            Number(
              selectedPolicy
                .uncommonProbability,
            );

          const rareProbability =
            Number(
              selectedPolicy
                .rareProbability,
            );

          let rarity:
            | 'COMMON'
            | 'UNCOMMON'
            | 'RARE'
            | 'LEGENDARY';

          if (
            randomValue <
            commonProbability
          ) {
            rarity = 'COMMON';
          } else if (
            randomValue <
            commonProbability +
              uncommonProbability
          ) {
            rarity =
              'UNCOMMON';
          } else if (
            randomValue <
            commonProbability +
              uncommonProbability +
              rareProbability
          ) {
            rarity = 'RARE';
          } else {
            rarity =
              'LEGENDARY';
          }

          /*
           * 지급 후보 재료
           *
           * 실제로 필요한 값은
           * ingredient.id뿐이므로
           * id만 조회한다.
           */
          let ingredients: {
            id: bigint;
          }[];

          if (
            rarity !==
            'LEGENDARY'
          ) {
            /*
             * COMMON / UNCOMMON / RARE
             *
             * 활성 BASIC 재료 중에서 선택
             */
            ingredients =
              await tx.ingredient
                .findMany({
                  where: {
                    ingredientType:
                      'BASIC',

                    rarity,

                    isActive:
                      true,
                  },

                  select: {
                    id: true,
                  },
                });
          } else {
            /*
             * LEGENDARY
             *
             * 방문 장소의 행정지역을
             * PROVINCE까지 추적한 후
             * FOOD_REGION으로 매핑한다.
             */
            const place =
              await tx.place
                .findUnique({
                  where: {
                    id:
                      verification
                        .placeId,
                  },

                  select: {
                    districtRegionId:
                      true,

                    adminDongRegionId:
                      true,

                    legalDongRegionId:
                      true,
                  },
                });

            if (!place) {
              throw new BadRequestException(
                '방문 장소를 찾을 수 없습니다.',
              );
            }

            let currentRegionId =
              place
                .districtRegionId ??
              place
                .adminDongRegionId ??
              place
                .legalDongRegionId;

            if (
              !currentRegionId
            ) {
              throw new BadRequestException(
                '장소의 지역 정보를 찾을 수 없습니다.',
              );
            }

            let provinceRegionId:
              | bigint
              | null = null;

            /*
             * 부모 지역을 따라 올라가면서
             * PROVINCE 탐색
             */
            while (
              currentRegionId
            ) {
              const region: {
  id: bigint;
  parentId: bigint | null;
  regionType: string;
} | null =
  await tx.region.findUnique({
    where: {
      id: currentRegionId,
    },

    select: {
      id: true,
      parentId: true,
      regionType: true,
    },
  });

              if (!region) {
                break;
              }

              if (
                region.regionType ===
                'PROVINCE'
              ) {
                provinceRegionId =
                  region.id;

                break;
              }

              currentRegionId =
                region.parentId;
            }

            if (
              !provinceRegionId
            ) {
              throw new BadRequestException(
                '광역 지역 정보를 찾을 수 없습니다.',
              );
            }

            /*
             * PROVINCE → FOOD_REGION
             */
            const foodRegionMapping =
              await tx
                .regionFoodRegionMapping
                .findFirst({
                  where: {
                    sourceRegionId:
                      provinceRegionId,
                  },

                  select: {
                    foodRegionId:
                      true,
                  },
                });

            if (
              !foodRegionMapping
            ) {
              throw new BadRequestException(
                '음식 권역 매핑 정보를 찾을 수 없습니다.',
              );
            }

            /*
             * 해당 FOOD_REGION의
             * 활성 LEGENDARY REGIONAL 재료
             */
            ingredients =
              await tx.ingredient
                .findMany({
                  where: {
                    ingredientType:
                      'REGIONAL',

                    rarity:
                      'LEGENDARY',

                    regionId:
                      foodRegionMapping
                        .foodRegionId,

                    isActive:
                      true,
                  },

                  select: {
                    id: true,
                  },
                });
          }

          if (
            ingredients.length ===
            0
          ) {
            throw new BadRequestException(
              '지급 가능한 재료가 없습니다.',
            );
          }

          /*
           * 같은 rarity의 후보 중
           * 균등 랜덤 선택
           */
          const ingredient =
            ingredients[
              Math.floor(
                Math.random() *
                  ingredients.length,
              )
            ];

          /*
           * 방문 인증 1회당
           * 선택된 재료 1종 × 2개 지급
           */
          const rewardQuantity =
            2;

          /*
           * 사용자 보유 재료 증가
           */
          await tx.userIngredient
            .upsert({
              where: {
                userId_ingredientId:
                  {
                    userId:
                      verification
                        .userId,

                    ingredientId:
                      ingredient.id,
                  },
              },

              create: {
                userId:
                  verification
                    .userId,

                ingredientId:
                  ingredient.id,

                quantity:
                  rewardQuantity,

                firstAcquiredAt:
                  now,

                updatedAt:
                  now,
              },

              update: {
                quantity: {
                  increment:
                    rewardQuantity,
                },

                updatedAt:
                  now,
              },
            });

          /*
           * 보상 지급 이력 생성
           */
          await tx
            .ingredientTransaction
            .create({
              data: {
                userId:
                  verification
                    .userId,

                ingredientId:
                  ingredient.id,

                quantityChange:
                  rewardQuantity,

                transactionType:
                  'VISIT_REWARD',

                placeId:
                  verification
                    .placeId,

                visitVerificationId:
                  verification.id,

                userFoodId:
                  null,
              },
            });

            /*
 * 방문 인증 성공 보상
 * XP +15
 *
 * XP 100마다 level +1,
 * 남은 XP만 저장한다.
 *
 * 예:
 * level 2 / xp 90
 * +15
 * -> level 3 / xp 5
 */
await tx.$executeRaw`
  UPDATE "users"
  SET
    "level" =
      COALESCE("level", 1)
      + (
          (
            COALESCE("xp", 0)
            + 15
          ) / 100
        ),
    "xp" =
      (
        COALESCE("xp", 0)
        + 15
      ) % 100,
    "updated_at" = NOW()
  WHERE "id" = ${verification.userId}
`;

          /*
           * 최종 인증 데이터 반환
           */
          return tx
            .visitVerification
            .findUnique({
              where: {
                id:
                  verification.id,
              },
            });
        },
      );

    if (
      !updatedVerification
    ) {
      return undefined;
    }

    return this.toVisitVerification(
      updatedVerification,
    );
  }


  private async isVerificationAvailableAt(
  placeId: number,
  hoursMode: string,
  targetAt: Date,
): Promise<boolean> {
  const {
    dateString,
    dayOfWeek,
    currentMinutes,
  } = this.getSeoulDateTimeParts(
    targetAt,
  );

  /*
   * 별도 방문 인증 시간 사용
   */
  if (
    hoursMode === 'CUSTOM'
  ) {
    const hour =
      await this.prisma
        .placeVerificationHour
        .findUnique({
          where: {
            placeId_dayOfWeek: {
              placeId:
                BigInt(placeId),

              dayOfWeek,
            },
          },
        });

    if (
      !hour ||
      !hour.enabled ||
      !hour.startTime ||
      !hour.endTime
    ) {
      return false;
    }

    return this.isWithinTimeRange(
      currentMinutes,
      hour.startTime,
      hour.endTime,
    );
  }

  /*
   * 매장 운영시간과 동일하게 사용
   */
  if (
    hoursMode ===
    'SAME_AS_OPERATING'
  ) {
    /*
     * 특정 날짜 특별 운영시간이 있으면
     * 일반 요일 운영시간보다 우선
     */
    const specialHour =
      await this.prisma
        .placeSpecialHour
        .findFirst({
          where: {
            placeId:
              BigInt(placeId),

            targetDate:
              new Date(
                `${dateString}T00:00:00.000Z`,
              ),
          },
        });

    if (specialHour) {
      if (
        specialHour.scheduleType ===
        'CLOSED'
      ) {
        return false;
      }

      if (
        specialHour.scheduleType ===
        'SPECIAL_OPEN'
      ) {
        return this.isWithinTimeRange(
          currentMinutes,
          specialHour.openTime,
          specialHour.closeTime,
          specialHour.breakStartTime,
          specialHour.breakEndTime,
        );
      }
    }

    const operatingHour =
      await this.prisma
        .placeOperatingHour
        .findUnique({
          where: {
            placeId_dayOfWeek: {
              placeId:
                BigInt(placeId),

              dayOfWeek,
            },
          },
        });

    if (
      !operatingHour ||
      operatingHour.isClosed
    ) {
      return false;
    }

    return this.isWithinTimeRange(
      currentMinutes,
      operatingHour.openTime,
      operatingHour.closeTime,
      operatingHour.breakStartTime,
      operatingHour.breakEndTime,
    );
  }

  /*
   * 정의되지 않은 hoursMode는
   * 안전하게 인증 불가 처리
   */
  return false;
}

private getSeoulDateTimeParts(
  date: Date,
): {
  dateString: string;
  dayOfWeek: number;
  currentMinutes: number;
} {
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Asia/Seoul',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        weekday:
          'short',

        hour:
          '2-digit',

        minute:
          '2-digit',

        hourCycle:
          'h23',
      },
    ).formatToParts(date);

  const getPart = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value;

  const year =
    getPart('year');

  const month =
    getPart('month');

  const day =
    getPart('day');

  const weekday =
    getPart('weekday');

  const hour =
    Number(
      getPart('hour'),
    );

  const minute =
    Number(
      getPart('minute'),
    );

  if (
    !year ||
    !month ||
    !day ||
    !weekday
  ) {
    throw new BadRequestException(
      '방문 인증 시간을 계산할 수 없습니다.',
    );
  }

  /*
   * 프로젝트 기존 규칙:
   * 월=1 ... 일=7
   */
  const dayMap: Record<
    string,
    number
  > = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  const dayOfWeek =
    dayMap[weekday];

  if (!dayOfWeek) {
    throw new BadRequestException(
      '요일 정보를 계산할 수 없습니다.',
    );
  }

  return {
    dateString:
      `${year}-${month}-${day}`,

    dayOfWeek,

    currentMinutes:
      hour * 60 +
      minute,
  };
}

private isWithinTimeRange(
  currentMinutes: number,
  startTime: Date | null,
  endTime: Date | null,
  breakStartTime:
    Date | null = null,
  breakEndTime:
    Date | null = null,
): boolean {
  if (
    !startTime ||
    !endTime
  ) {
    return false;
  }

  const startMinutes =
    this.timeToMinutes(
      startTime,
    );

  const endMinutes =
    this.timeToMinutes(
      endTime,
    );

  /*
   * 일반적인 같은 날 시간대
   * 예: 10:00 ~ 18:00
   */
  let withinMainHours:
    boolean;

  if (
    startMinutes <
    endMinutes
  ) {
    withinMainHours =
      currentMinutes >=
        startMinutes &&
      currentMinutes <
        endMinutes;
  } else {
    /*
     * 자정을 넘는 시간도 대응
     * 예: 22:00 ~ 02:00
     */
    withinMainHours =
      currentMinutes >=
        startMinutes ||
      currentMinutes <
        endMinutes;
  }

  if (!withinMainHours) {
    return false;
  }

  /*
   * 휴게시간 검사
   */
  if (
    breakStartTime &&
    breakEndTime
  ) {
    const breakStart =
      this.timeToMinutes(
        breakStartTime,
      );

    const breakEnd =
      this.timeToMinutes(
        breakEndTime,
      );

    let withinBreak:
      boolean;

    if (
      breakStart <
      breakEnd
    ) {
      withinBreak =
        currentMinutes >=
          breakStart &&
        currentMinutes <
          breakEnd;
    } else {
      withinBreak =
        currentMinutes >=
          breakStart ||
        currentMinutes <
          breakEnd;
    }

    if (withinBreak) {
      return false;
    }
  }

  return true;
}

private timeToMinutes(
  time: Date,
): number {
  return (
    time.getUTCHours() *
      60 +
    time.getUTCMinutes()
  );
}

private async generateUniqueVerificationCode(
  placeId: number,
): Promise<string> {
  /*
   * 관리자 화면에서는 6자리 코드로
   * 방문자를 찾으므로
   * 같은 장소의 유효 세션끼리는
   * 코드가 겹치지 않도록 한다.
   */
  for (
    let attempt = 0;
    attempt < 10;
    attempt++
  ) {
    const code =
      this.generateVerificationCode();

    const duplicate =
      await this.prisma
        .visitVerification
        .findFirst({
          where: {
            placeId:
              BigInt(placeId),

            verificationCode:
              code,

            status:
              'ISSUED',

            expiresAt: {
              gt:
                new Date(),
            },
          },

          select: {
            id: true,
          },
        });

    if (!duplicate) {
      return code;
    }
  }

  throw new BadRequestException(
    '인증번호 생성에 실패했습니다. 다시 시도해주세요.',
  );
}


  private generateVerificationCode(): string {
    return Math.floor(
      100000 +
        Math.random() * 900000,
    ).toString();
  }

  private toVisitVerification(
    verification: {
      id: bigint;
      userId: bigint;
      placeId: bigint;

      arrivalOptionMinutes:
        number | null;

      expectedArrivalAt:
        Date | null;

      verificationCode: string;

      issuedAt: Date;
      expiresAt: Date;

      status: string;

      verifiedAt:
        Date | null;

      failReason:
        string | null;

      createdAt: Date;
    },
  ): VisitVerification {
    return {
      id: Number(
        verification.id,
      ),

      userId: Number(
        verification.userId,
      ),

      placeId: Number(
        verification.placeId,
      ),

      arrivalOptionMinutes:
        verification
          .arrivalOptionMinutes,

      expectedArrivalAt:
        verification
          .expectedArrivalAt,

      verificationCode:
        verification
          .verificationCode,

      issuedAt:
        verification.issuedAt,

      expiresAt:
        verification.expiresAt,

      status:
        verification.status,

      verifiedAt:
        verification.verifiedAt,

      failReason:
        verification.failReason,

      createdAt:
        verification.createdAt,
    };
  }
}