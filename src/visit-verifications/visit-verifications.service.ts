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
        /*
 * 같은 방문 인증으로 이미 보상을 지급했는지 확인
 */
const existingReward =
  await tx.ingredientTransaction.findFirst({
    where: {
      visitVerificationId:
        verification.id,

      transactionType:
        'VISIT_REWARD',
    },
  });

if (existingReward) {
  throw new BadRequestException(
    '이미 재료 보상이 지급된 방문 인증입니다.',
  );
}

/*
 * 장소의 가장 최신 GAP Score 조회
 */
const latestGap =
  await tx.gapScoreHistory.findFirst({
    where: {
      placeId:
        verification.placeId,
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
      gapPercentile: true,
    },
  });

const gapPercentile =
  latestGap?.gapPercentile ===
    null ||
  latestGap?.gapPercentile ===
    undefined
    ? null
    : Number(
        latestGap.gapPercentile,
      );

/*
 * 현재 활성화된 drop policy 조회
 *
 * 확률과 percentile 범위를
 * 코드에 하드코딩하지 않고 DB에서 읽는다.
 */
const policies =
  await tx.ingredientDropPolicy.findMany({
    where: {
      isActive: true,
    },
  });

let selectedPolicy;

/*
 * GAP 데이터가 없으면 NO_GAP
 */
if (gapPercentile === null) {
  selectedPolicy =
    policies.find(
      (policy) =>
        policy.code ===
        'NO_GAP',
    );
} else {
  /*
   * 해당 percentile이 속하는
   * policy 구간 찾기
   *
   * 일반 구간: min <= p < max
   * 마지막 1.0은 GAP_TOP에 포함
   */
  selectedPolicy =
    policies.find(
      (policy) => {
        if (
          policy.code ===
          'NO_GAP' ||
          policy.minGapPercentile ===
            null ||
          policy.maxGapPercentile ===
            null
        ) {
          return false;
        }

        const min =
          Number(
            policy.minGapPercentile,
          );

        const max =
          Number(
            policy.maxGapPercentile,
          );

        return (
          gapPercentile >= min &&
          (
            gapPercentile < max ||
            (
              gapPercentile === 1 &&
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
 * DB에 저장된 확률로 rarity 추첨
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
  rarity = 'UNCOMMON';
} else if (
  randomValue <
  commonProbability +
    uncommonProbability +
    rareProbability
) {
  rarity = 'RARE';
} else {
  rarity = 'LEGENDARY';
}

/*
 * rarity에 맞는 지급 후보 재료 조회
 */
let ingredients;

if (rarity !== 'LEGENDARY') {
  /*
   * COMMON / UNCOMMON / RARE
   *
   * BASIC 재료 중에서 선택
   */
  ingredients =
    await tx.ingredient.findMany({
      where: {
        ingredientType:
          'BASIC',

        rarity,

        isActive: true,
      },
    });
} else {
  /*
   * LEGENDARY는 현재 장소의 행정지역을
   * FOOD_REGION으로 변환한 뒤
   * 해당 권역의 REGIONAL 재료에서 선택한다.
   */

  const place =
    await tx.place.findUnique({
      where: {
        id:
          verification.placeId,
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

  /*
   * 가능한 행정지역 하나를 시작점으로 잡는다.
   * 일반적으로 districtRegionId가 사용된다.
   */
  let currentRegionId =
    place.districtRegionId ??
    place.adminDongRegionId ??
    place.legalDongRegionId;

  if (!currentRegionId) {
    throw new BadRequestException(
      '장소의 지역 정보를 찾을 수 없습니다.',
    );
  }

  let provinceRegionId:
    bigint | null =
    null;

  /*
   * 부모 지역을 따라 올라가서
   * PROVINCE 찾기
   */
  while (currentRegionId) {
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

  if (!provinceRegionId) {
    throw new BadRequestException(
      '광역 지역 정보를 찾을 수 없습니다.',
    );
  }

  /*
   * PROVINCE → FOOD_REGION 매핑
   */
  const foodRegionMapping =
    await tx.regionFoodRegionMapping.findFirst({
      where: {
        sourceRegionId:
          provinceRegionId,
      },
    });

  if (!foodRegionMapping) {
    throw new BadRequestException(
      '음식 권역 매핑 정보를 찾을 수 없습니다.',
    );
  }

  /*
   * 해당 FOOD_REGION의 LEGENDARY 재료만 후보
   */
  ingredients =
    await tx.ingredient.findMany({
      where: {
        ingredientType:
          'REGIONAL',

        rarity:
          'LEGENDARY',

        regionId:
          foodRegionMapping
            .foodRegionId,

        isActive: true,
      },
    });
}

if (
  ingredients.length === 0
) {
  throw new BadRequestException(
    '지급 가능한 재료가 없습니다.',
  );
}

/*
 * 같은 rarity 후보 안에서는 균등 랜덤
 */
const ingredient =
  ingredients[
    Math.floor(
      Math.random() *
        ingredients.length,
    )
  ];

/*
 * 방문 1회당
 * 선택된 재료 1종을 2개 지급
 */
const rewardQuantity = 2;

await tx.userIngredient.upsert({
  where: {
    userId_ingredientId: {
      userId:
        verification.userId,

      ingredientId:
        ingredient.id,
    },
  },

  create: {
    userId:
      verification.userId,

    ingredientId:
      ingredient.id,

    quantity:
      rewardQuantity,

    firstAcquiredAt: now,
    updatedAt: now,
  },

  update: {
    quantity: {
      increment:
        rewardQuantity,
    },

    updatedAt: now,
  },
});

/*
 * 지급 이력 기록
 */
await tx.ingredientTransaction.create({
  data: {
    userId:
      verification.userId,

    ingredientId:
      ingredient.id,

    quantityChange:
      rewardQuantity,

    transactionType:
      'VISIT_REWARD',

    placeId:
      verification.placeId,

    visitVerificationId:
      verification.id,

    userFoodId: null,
  },
});

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