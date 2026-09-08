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
     * 장소 존재 여부 + 방문인증 설정 확인
     *
     * PlacesService.findById()를 호출하지 않고
     * 필요한 정보만 DB에서 직접 조회한다.
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
        '방문 인증을 사용할 수 없는 장소입니다.',
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
     * 인증 만료 시각
     *
     * 예:
     * 지금 14:00
     * 30분 후 도착 선택
     * codeValidMinutes = 30
     *
     * expectedArrivalAt = 14:30
     * expiresAt         = 15:00
     */
    const expiresAt =
      new Date(
        expectedArrivalAt.getTime() +
          place.verificationSetting
            .codeValidMinutes *
            60 *
            1000,
      );

    const verificationCode =
      this.generateVerificationCode();

    const verification =
      await this.prisma.visitVerification.create({
        data: {
          userId: BigInt(userId),

          placeId: BigInt(
            dto.placeId,
          ),

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
    VisitVerification | undefined
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
      verification.status ===
        'ISSUED' &&
      new Date() >
        verification.expiresAt
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

    return this.toVisitVerification(
      verification,
    );
  }

  async verify(
  userId: number,
  id: number,
  verificationCode: string,
): Promise<VisitVerification | undefined> {
  /*
   * 1. 사용자 본인의 인증 세션인지 확인
   */
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
   * 2. 만료 확인
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
      '인증 시간이 만료되었습니다.',
    );
  }

  /*
   * 3. 이미 처리된 인증인지 확인
   */
  if (
    verification.status !== 'ISSUED'
  ) {
    throw new BadRequestException(
      '이미 처리된 방문 인증입니다.',
    );
  }

  /*
   * 4. 인증 코드 확인
   */
  if (
    verification.verificationCode !==
    verificationCode
  ) {
    throw new BadRequestException(
      '인증 코드가 올바르지 않습니다.',
    );
  }

  const now = new Date();

  /*
   * 5. 인증 성공 + 재료 지급을
   * 하나의 DB 트랜잭션으로 처리
   */
  const updatedVerification =
    await this.prisma.$transaction(
      async (tx) => {
        /*
         * VERIFIED 상태로 변경.
         *
         * status = ISSUED 조건을 같이 걸어
         * 같은 인증을 동시에 두 번 요청해도
         * 하나만 성공하게 한다.
         */
        const updateResult =
          await tx.visitVerification.updateMany({
            where: {
              id: verification.id,
              userId: verification.userId,
              status: 'ISSUED',
            },

            data: {
              status: 'VERIFIED',
              verifiedAt: now,
              failReason: null,
            },
          });

        if (updateResult.count !== 1) {
          throw new BadRequestException(
            '이미 처리된 방문 인증입니다.',
          );
        }

        /*
         * 해당 장소에서 받을 수 있는
         * 현재 활성화된 방문인증 보상 조회
         */
        const rewards =
          await tx.placeIngredientReward.findMany({
            where: {
              placeId: verification.placeId,

              isActive: true,

              rewardRule:
                'EVERY_VISIT',

              AND: [
                {
                  OR: [
                    {
                      validFrom: null,
                    },
                    {
                      validFrom: {
                        lte: now,
                      },
                    },
                  ],
                },

                {
                  OR: [
                    {
                      validUntil: null,
                    },
                    {
                      validUntil: {
                        gte: now,
                      },
                    },
                  ],
                },
              ],
            },

            include: {
              ingredient: true,
            },
          });

        /*
         * 보상 하나씩 지급
         */
        for (const reward of rewards) {
          /*
           * 비활성화된 재료는 지급하지 않음
           */
          if (!reward.ingredient.isActive) {
            continue;
          }

          /*
           * 이미 가지고 있는 재료라면 수량 증가,
           * 처음 획득하는 재료라면 row 생성
           */
          await tx.userIngredient.upsert({
            where: {
              userId_ingredientId: {
                userId:
                  verification.userId,

                ingredientId:
                  reward.ingredientId,
              },
            },

            create: {
              userId:
                verification.userId,

              ingredientId:
                reward.ingredientId,

              quantity:
                reward.quantity,

              firstAcquiredAt: now,
              updatedAt: now,
            },

            update: {
              quantity: {
                increment:
                  reward.quantity,
              },

              updatedAt: now,
            },
          });

          /*
           * 재료 지급 이력 저장
           */
          await tx.ingredientTransaction.create({
            data: {
              userId:
                verification.userId,

              ingredientId:
                reward.ingredientId,

              quantityChange:
                reward.quantity,

              transactionType:
                'VISIT_REWARD',

              placeId:
                verification.placeId,

              visitVerificationId:
                verification.id,
            },
          });
        }

        /*
         * 최종 인증 상태 반환
         */
        return tx.visitVerification.findUnique({
          where: {
            id: verification.id,
          },
        });
      },
    );

  if (!updatedVerification) {
    return undefined;
  }

  return this.toVisitVerification(
    updatedVerification,
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

      verifiedAt: Date | null;
      failReason: string | null;

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