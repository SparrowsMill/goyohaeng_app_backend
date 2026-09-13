import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type PlaceStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'CLOSED'
  | 'HIDDEN';

export interface Place {
  id: number;
  name: string;

  categoryId: number | null;

  districtRegionId: number | null;
  adminDongRegionId: number | null;
  legalDongRegionId: number | null;

  roadAddress: string | null;
  lotAddress: string | null;
  postalCode: string | null;

  latitude: number | null;
  longitude: number | null;

  phone: string | null;
  homepage: string | null;

  overview: string | null;

  status: string;
}

interface PlaceImage {
  id: number;
  placeId: number;
  originalUrl: string;
  thumbnailUrl: string | null;
  displayOrder: number | null;
}

interface PlaceOperatingHour {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStartTime: string | null;
  breakEndTime: string | null;
}

interface PlaceBenefit {
  id: number;
  title: string;
  description: string | null;
}

interface VerificationSetting {
  enabled: boolean;
  controlMode: string;
  hoursMode: string;
  codeValidMinutes: number;
}

interface AvailableIngredient {
  id: number;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  quantity: number;
  rewardRule: string;
}

export interface PlaceDetail extends Place {
  images: PlaceImage[];

  operatingHours: PlaceOperatingHour[];

  isOpenNow: boolean;

  benefits: PlaceBenefit[];

  availableIngredients: AvailableIngredient[];

  verification: VerificationSetting | null;

  isFavorite: boolean;
}

export interface PaginatedPlacesResponse {
  items: Place[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
  regionId?: number,
  categoryId?: number,
  page = 1,
  limit = 20,
): Promise<PaginatedPlacesResponse> {

    let categoryIds:
    bigint[] | undefined;

  if (categoryId !== undefined) {
    const selectedCategoryId =
      BigInt(categoryId);

    const categories =
      await this.prisma.category.findMany({
        where: {
          isActive: true,

          OR: [
            {
              id:
                selectedCategoryId,
            },
            {
              parentId:
                selectedCategoryId,
            },
          ],
        },

        select: {
          id: true,
        },
      });

    categoryIds =
      categories.map(
        (category) =>
          category.id,
      );
  }

  const where = {
    status: 'ACTIVE',

    ...(regionId !== undefined && {
      districtRegionId: BigInt(regionId),
    }),

    ...(categoryIds !== undefined && {
  categoryId: {
    in: categoryIds,
  },
}),
  };

  const skip = (page - 1) * limit;

  const [places, total] = await Promise.all([
    this.prisma.place.findMany({
      where,

      orderBy: {
        id: 'asc',
      },

      skip,
      take: limit,
    }),

    this.prisma.place.count({
      where,
    }),
  ]);

  const items: Place[] = places.map((place) => ({
    id: Number(place.id),

    name: place.name,

    categoryId:
      place.categoryId === null
        ? null
        : Number(place.categoryId),

    districtRegionId:
      place.districtRegionId === null
        ? null
        : Number(place.districtRegionId),

    adminDongRegionId:
      place.adminDongRegionId === null
        ? null
        : Number(place.adminDongRegionId),

    legalDongRegionId:
      place.legalDongRegionId === null
        ? null
        : Number(place.legalDongRegionId),

    roadAddress: place.roadAddress,
    lotAddress: place.lotAddress,
    postalCode: place.postalCode,

    latitude:
      place.latitude === null
        ? null
        : Number(place.latitude),

    longitude:
      place.longitude === null
        ? null
        : Number(place.longitude),

    phone: place.phone,
    homepage: place.homepage,

    overview: place.overview,

    status: place.status,
  }));

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

  async findById(
    id: number,
    userId: number,
  ): Promise<PlaceDetail | undefined> {

    const now = new Date();
    const place = await this.prisma.place.findFirst({
      where: {
        id: BigInt(id),
        status: 'ACTIVE',
      },

      include: {
        images: {
          where: {
            isActive: true,
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },

        operatingHours: {
          orderBy: {
            dayOfWeek: 'asc',
          },
        },

        specialHours: true,

        benefits: {
  where: {
    isActive: true,

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

  orderBy: {
    createdAt: 'desc',
  },
},

        verificationSetting: true,

        ingredientRewards: {
          where: {
            isActive: true,
          },
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!place) {
      return undefined;
    }
const favorite =
  await this.prisma.placeFavorite.findUnique({
    where: {
      userId_placeId: {
        userId: BigInt(userId),
        placeId: BigInt(id),
      },
    },
    select: {
      userId: true,
    },
  });

const isFavorite = !!favorite;

    const operatingHours: PlaceOperatingHour[] =
      place.operatingHours.map((hours) => ({
        dayOfWeek: hours.dayOfWeek,
        isClosed: hours.isClosed,

        openTime: this.formatTime(
          hours.openTime,
        ),

        closeTime: this.formatTime(
          hours.closeTime,
        ),

        breakStartTime: this.formatTime(
          hours.breakStartTime,
        ),

        breakEndTime: this.formatTime(
          hours.breakEndTime,
        ),
      }));

    const isOpenNow = this.calculateIsOpenNow(
      place.operatingHours,
      place.specialHours,
    );

    return {
      id: Number(place.id),

      name: place.name,

      categoryId:
        place.categoryId === null
          ? null
          : Number(place.categoryId),

      districtRegionId:
        place.districtRegionId === null
          ? null
          : Number(place.districtRegionId),

      adminDongRegionId:
        place.adminDongRegionId === null
          ? null
          : Number(place.adminDongRegionId),

      legalDongRegionId:
        place.legalDongRegionId === null
          ? null
          : Number(place.legalDongRegionId),

      roadAddress: place.roadAddress,
      lotAddress: place.lotAddress,
      postalCode: place.postalCode,

      latitude:
        place.latitude === null
          ? null
          : Number(place.latitude),

      longitude:
        place.longitude === null
          ? null
          : Number(place.longitude),

      phone: place.phone,
      homepage: place.homepage,

      overview: place.overview,

      status: place.status,

      images: place.images.map((image) => ({
        id: Number(image.id),
        placeId: Number(image.placeId),

        originalUrl: image.originalUrl,
        thumbnailUrl: image.thumbnailUrl,

        displayOrder: image.displayOrder,
      })),

      operatingHours,

      isOpenNow,

      benefits: place.benefits.map(
        (benefit) => ({
          id: Number(benefit.id),
          title: benefit.title,
          description: benefit.description,
        }),
      ),

      availableIngredients:
        place.ingredientRewards.map(
          (reward) => ({
            id: Number(reward.ingredient.id),

            name: reward.ingredient.name,

            imageUrl:
              reward.ingredient.imageUrl,

            rarity:
              reward.ingredient.rarity,

            quantity: reward.quantity,

            rewardRule:
              reward.rewardRule,
          }),
        ),

      verification:
        place.verificationSetting === null
          ? null
          : {
              enabled:
                place.verificationSetting.enabled,

              controlMode:
                place.verificationSetting
                  .controlMode,

              hoursMode:
                place.verificationSetting.hoursMode,

              codeValidMinutes:
                place.verificationSetting
                  .codeValidMinutes,
            },
            isFavorite,
    };
  }

  private calculateIsOpenNow(
    operatingHours: Array<{
      dayOfWeek: number;
      isClosed: boolean;
      openTime: Date | null;
      closeTime: Date | null;
      breakStartTime: Date | null;
      breakEndTime: Date | null;
    }>,
    specialHours: Array<{
      targetDate: Date;
      scheduleType: string;
      openTime: Date | null;
      closeTime: Date | null;
      breakStartTime: Date | null;
      breakEndTime: Date | null;
    }>,
  ): boolean {
    const now = new Date();

    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        },
      ).formatToParts(now);

    const getPart = (type: string) =>
      parts.find(
        (part) => part.type === type,
      )?.value;

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');

    const weekday = getPart('weekday');

    const hour = Number(
      getPart('hour'),
    );

    const minute = Number(
      getPart('minute'),
    );

    if (
      !year ||
      !month ||
      !day ||
      !weekday
    ) {
      return false;
    }

    const today =
      `${year}-${month}-${day}`;

    const currentMinutes =
      hour * 60 + minute;

    /*
     * 특정 날짜 영업정보가 있으면
     * 일반 주간 영업시간보다 우선한다.
     */
    const special =
      specialHours.find(
        (specialHour) =>
          specialHour.targetDate
            .toISOString()
            .slice(0, 10) === today,
      );

    if (special) {
      if (
        special.scheduleType ===
        'CLOSED'
      ) {
        return false;
      }

      if (
        special.scheduleType ===
        'SPECIAL_OPEN'
      ) {
        return this.isWithinOpeningHours(
          currentMinutes,
          special.openTime,
          special.closeTime,
          special.breakStartTime,
          special.breakEndTime,
        );
      }
    }

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

    const todayHours =
      operatingHours.find(
        (hours) =>
          hours.dayOfWeek === dayOfWeek,
      );

    if (
      !todayHours ||
      todayHours.isClosed
    ) {
      return false;
    }

    return this.isWithinOpeningHours(
      currentMinutes,
      todayHours.openTime,
      todayHours.closeTime,
      todayHours.breakStartTime,
      todayHours.breakEndTime,
    );
  }

  private isWithinOpeningHours(
    currentMinutes: number,
    openTime: Date | null,
    closeTime: Date | null,
    breakStartTime: Date | null,
    breakEndTime: Date | null,
  ): boolean {
    if (
      !openTime ||
      !closeTime
    ) {
      return false;
    }

    const openMinutes =
      this.dateTimeToMinutes(
        openTime,
      );

    const closeMinutes =
      this.dateTimeToMinutes(
        closeTime,
      );

    if (
      currentMinutes < openMinutes ||
      currentMinutes >= closeMinutes
    ) {
      return false;
    }

    if (
      breakStartTime &&
      breakEndTime
    ) {
      const breakStart =
        this.dateTimeToMinutes(
          breakStartTime,
        );

      const breakEnd =
        this.dateTimeToMinutes(
          breakEndTime,
        );

      if (
        currentMinutes >= breakStart &&
        currentMinutes < breakEnd
      ) {
        return false;
      }
    }

    return true;
  }

  private dateTimeToMinutes(
    time: Date,
  ): number {
    return (
      time.getUTCHours() * 60 +
      time.getUTCMinutes()
    );
  }

  private formatTime(
    time: Date | null,
  ): string | null {
    if (!time) {
      return null;
    }

    const hour = time
      .getUTCHours()
      .toString()
      .padStart(2, '0');

    const minute = time
      .getUTCMinutes()
      .toString()
      .padStart(2, '0');

    return `${hour}:${minute}`;
  }

  async getTrendSummary(
  placeId: number,
) {
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },

      select: {
        id: true,
        name: true,

        trendSnapshots: {
          orderBy: {
            generatedAt: 'desc',
          },
          take: 1,

          select: {
            summaryText: true,
            keywords: true,
            periodStart: true,
            periodEnd: true,
            generatedAt: true,
          },
        },

        externalContents: {
          orderBy: {
            publishedAt: 'desc',
          },
          take: 10,

          select: {
            id: true,
            contentType: true,
            title: true,
            url: true,
            author: true,
            publishedAt: true,
          },
        },

        naverSearchTerms: {
          where: {
            isActive: true,
          },

          orderBy: {
            version: 'desc',
          },

          take: 1,

          select: {
            searchTerm: true,

            interest: {
              orderBy: {
                periodStart: 'desc',
              },

              take: 30,

              select: {
                periodStart: true,
                ratio: true,
              },
            },
          },
        },
      },
    });

  if (!place) {
    return undefined;
  }

  const trend =
    place.trendSnapshots[0] ?? null;

  const searchTerm =
    place.naverSearchTerms[0] ?? null;

  return {
    placeId: Number(place.id),
    placeName: place.name,

    summaryText:
      trend?.summaryText ?? null,

    keywords:
      trend?.keywords ?? [],

    periodStart:
      trend?.periodStart ?? null,

    periodEnd:
      trend?.periodEnd ?? null,

    generatedAt:
      trend?.generatedAt ?? null,

    contents:
      place.externalContents.map(
        (content) => ({
          id: Number(content.id),

          contentType:
            content.contentType,

          title:
            content.title,

          url:
            content.url,

          author:
            content.author,

          publishedAt:
            content.publishedAt,
        }),
      ),

    searchTerm:
      searchTerm?.searchTerm ?? null,

    searchInterest:
      searchTerm?.interest.map(
        (item) => ({
          periodStart:
            item.periodStart,

          ratio:
            Number(item.ratio),
        }),
      ) ?? [],

  
  };
}

async rewardTrendFirstView(
  userId: number,
  placeId: number,
): Promise<
  | {
      firstView: boolean;
      rewarded: boolean;
      ingredient: {
        id: number;
        name: string;
        quantity: number;
      } | null;
    }
  | undefined
> {
  // 1. 존재하는 활성 장소인지 확인
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

  if (!place) {
    return undefined;
  }

  return this.prisma.$transaction(
    async (tx) => {
      // 2. 이 사용자가 이 장소의 트렌드 보상을
      // 이미 받은 적이 있는지 확인
      const existingReward =
        await tx.ingredientTransaction.findFirst({
          where: {
            userId: BigInt(userId),
            placeId: BigInt(placeId),
            transactionType:
              'TREND_FIRST_VIEW',
          },
          select: {
            id: true,
          },
        });

      if (existingReward) {
        return {
          firstView: false,
          rewarded: false,
          ingredient: null,
        };
      }

      // 3. 활성화된 BASIC 재료 조회
      const basicIngredients =
        await tx.ingredient.findMany({
          where: {
            ingredientType: 'BASIC',
            isActive: true,
          },
          select: {
            id: true,
            name: true,
          },
        });

      if (basicIngredients.length === 0) {
        throw new Error(
          '지급 가능한 BASIC 재료가 없습니다.',
        );
      }

      // 4. BASIC 재료 중 랜덤 1개 선택
      const randomIngredient =
        basicIngredients[
          Math.floor(
            Math.random() *
              basicIngredients.length,
          )
        ];

      const now = new Date();

      // 5. 사용자 재료 수량 +1
      await tx.userIngredient.upsert({
        where: {
          userId_ingredientId: {
            userId: BigInt(userId),
            ingredientId:
              randomIngredient.id,
          },
        },

        update: {
          quantity: {
            increment: 1,
          },
          updatedAt: now,
        },

        create: {
          userId: BigInt(userId),
          ingredientId:
            randomIngredient.id,
          quantity: 1,
          firstAcquiredAt: now,
          updatedAt: now,
        },
      });

      // 6. 지급 이력 기록
      await tx.ingredientTransaction.create({
        data: {
          userId: BigInt(userId),
          ingredientId:
            randomIngredient.id,
          quantityChange: 1,
          transactionType:
            'TREND_FIRST_VIEW',
          placeId: BigInt(placeId),
        },
      });

      /*
 * 트렌드 최초 조회 보상
 * 사용자별·장소별 최초 1회만 XP +5
 *
 * TREND_FIRST_VIEW 지급 이력이 이미 있으면
 * 위에서 return되므로 중복 지급되지 않는다.
 */
await tx.$executeRaw`
  UPDATE "users"
  SET
    "level" =
      COALESCE("level", 1)
      + (
          (
            COALESCE("xp", 0)
            + 5
          ) / 100
        ),
    "xp" =
      (
        COALESCE("xp", 0)
        + 5
      ) % 100,
    "updated_at" = NOW()
  WHERE "id" = ${BigInt(userId)}
`;

      return {
        firstView: true,
        rewarded: true,
        ingredient: {
          id: Number(
            randomIngredient.id,
          ),
          name:
            randomIngredient.name,
          quantity: 1,
        },
      };
    },
  );
}

async getGapScore(
  placeId: number,
) {
  // 1. 활성 장소인지 먼저 확인
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },

      select: {
        id: true,
        name: true,
      },
    });

  if (!place) {
    return undefined;
  }

  // 2. 해당 장소의 가장 최신 GAP Score 조회
  const gap =
    await this.prisma.gapScoreHistory.findFirst({
      where: {
        placeId: BigInt(placeId),
      },

      orderBy: [
        {
          calculatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: {
        id: true,

        gapScore: true,
        onlineScore: true,
        offlineScore: true,

        naverPercentile: true,
        snsPercentile: true,
        navigationPercentile: true,

        visitorPercentile: true,
        expenditurePercentile: true,
        nonlocalVisitorPercentile: true,

        explanationText: true,

        formulaVersion: true,
        dataStage: true,
        calculatedAt: true,

        runId: true,
        gapMetricMappingId: true,
      },
    });

  // 장소는 있지만 아직 GAP 점수가 없는 경우
  if (!gap) {
    return {
      placeId: Number(place.id),
      placeName: place.name,

      available: false,
      gapScore: null,
    };
  }

  return {
    placeId: Number(place.id),
    placeName: place.name,

    available: true,

    gapScore:
      Number(gap.gapScore),

    onlineScore:
      gap.onlineScore === null
        ? null
        : Number(gap.onlineScore),

    offlineScore:
      gap.offlineScore === null
        ? null
        : Number(gap.offlineScore),

    percentiles: {
      naver:
        gap.naverPercentile === null
          ? null
          : Number(
              gap.naverPercentile,
            ),

      sns:
        gap.snsPercentile === null
          ? null
          : Number(
              gap.snsPercentile,
            ),

      navigation:
        gap.navigationPercentile === null
          ? null
          : Number(
              gap.navigationPercentile,
            ),

      visitor:
        gap.visitorPercentile === null
          ? null
          : Number(
              gap.visitorPercentile,
            ),

      expenditure:
        gap.expenditurePercentile === null
          ? null
          : Number(
              gap.expenditurePercentile,
            ),

      nonlocalVisitor:
        gap.nonlocalVisitorPercentile === null
          ? null
          : Number(
              gap.nonlocalVisitorPercentile,
            ),
    },

    explanation:
      gap.explanationText,

    formulaVersion:
      gap.formulaVersion,

    dataStage:
      gap.dataStage,

    calculatedAt:
      gap.calculatedAt,

    runId:
      Number(gap.runId),

    gapMetricMappingId:
      Number(
        gap.gapMetricMappingId,
      ),
  };
}

async getGapRankings(
  regionId?: number,
  categoryId?: number,
  page: number = 1,
  limit: number = 20,
) {
  const safePage =
    Math.max(page, 1);

  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      100,
    );

  const skip =
    (safePage - 1) *
    safeLimit;

  // 실제 GAP Score가 존재하는 가장 최신 계산 회차
  const latestRun =
    await this.prisma.gapScoreRun.findFirst({
      where: {
        scores: {
          some: {},
        },
      },

      orderBy: [
        {
          calculatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: {
        id: true,
        formulaVersion: true,
        dataStage: true,
        calculatedAt: true,
      },
    });

  // 아직 GAP Score 계산 결과가 없는 경우
  if (!latestRun) {
    return {
      run: null,

      items: [],

      page: safePage,
      limit: safeLimit,
      total: 0,
      totalPages: 0,
    };
  }

  let categoryIds:
  bigint[] | undefined;

if (categoryId !== undefined) {
  const selectedCategoryId =
    BigInt(categoryId);

  const categories =
    await this.prisma.category.findMany({
      where: {
        isActive: true,

        OR: [
          {
            id:
              selectedCategoryId,
          },
          {
            parentId:
              selectedCategoryId,
          },
        ],
      },

      select: {
        id: true,
      },
    });

  categoryIds =
    categories.map(
      (category) =>
        category.id,
    );
}

  const where = {
    runId: latestRun.id,

    place: {
      status: 'ACTIVE',

      ...(regionId !== undefined && {
        districtRegionId:
          BigInt(regionId),
      }),

      ...(categoryIds !== undefined && {
  categoryId: {
    in: categoryIds,
  },
}),
    },
  };

  const [scores, total] =
    await Promise.all([
      this.prisma.gapScoreHistory.findMany({
        where,

        orderBy: [
          {
            gapScore: 'desc',
          },
          {
            id: 'asc',
          },
        ],

        skip,
        take: safeLimit,

        select: {
          id: true,

          gapScore: true,
          onlineScore: true,
          offlineScore: true,

          explanationText: true,

          place: {
            select: {
              id: true,
              name: true,

              categoryId: true,
              districtRegionId: true,

              roadAddress: true,

              images: {
                where: {
                  isActive: true,
                },

                orderBy: {
                  displayOrder: 'asc',
                },

                take: 1,

                select: {
                  originalUrl: true,
                  thumbnailUrl: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.gapScoreHistory.count({
        where,
      }),
    ]);

  return {
    run: {
      id:
        Number(latestRun.id),

      formulaVersion:
        latestRun.formulaVersion,

      dataStage:
        latestRun.dataStage,

      calculatedAt:
        latestRun.calculatedAt,
    },

    items:
      scores.map(
        (score, index) => ({
          rank:
            skip +
            index +
            1,

          placeId:
            Number(score.place.id),

          placeName:
            score.place.name,

          categoryId:
            score.place.categoryId === null
              ? null
              : Number(
                  score.place.categoryId,
                ),

          regionId:
            score.place
              .districtRegionId === null
              ? null
              : Number(
                  score.place
                    .districtRegionId,
                ),

          roadAddress:
            score.place.roadAddress,

          imageUrl:
            score.place.images[0]
              ?.thumbnailUrl ??
            score.place.images[0]
              ?.originalUrl ??
            null,

          gapScore:
            Number(score.gapScore),

          onlineScore:
            score.onlineScore === null
              ? null
              : Number(
                  score.onlineScore,
                ),

          offlineScore:
            score.offlineScore === null
              ? null
              : Number(
                  score.offlineScore,
                ),

          explanation:
            score.explanationText,
        }),
      ),

    page: safePage,
    limit: safeLimit,
    total,

    totalPages:
      Math.ceil(
        total /
        safeLimit,
      ),
  };
}

async getRecommendations(
  placeId: number,
  limit: number = 5,
) {
  const safeLimit =
    Math.min(
      Math.max(limit, 1),
      20,
    );

  // 1. 기준 장소 조회
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },

      select: {
        id: true,
        name: true,
        categoryId: true,
        districtRegionId: true,
      },
    });

  if (!place) {
    return undefined;
  }

  /*
   * 같은 지역 + 같은 카테고리를 기준으로 추천하므로
   * 둘 중 하나라도 없으면 추천 불가
   */
  if (
    place.categoryId === null ||
    place.districtRegionId === null
  ) {
    return {
      basePlace: {
        id: Number(place.id),
        name: place.name,
        categoryId:
          place.categoryId === null
            ? null
            : Number(place.categoryId),
        regionId:
          place.districtRegionId === null
            ? null
            : Number(
                place.districtRegionId,
              ),
        gapScore: null,
      },

      available: false,
      items: [],
    };
  }

  // 2. 기준 장소의 최신 GAP Score
  const baseGap =
    await this.prisma.gapScoreHistory.findFirst({
      where: {
        placeId: place.id,
      },

      orderBy: [
        {
          calculatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: {
        gapScore: true,
        runId: true,
        formulaVersion: true,
        dataStage: true,
        calculatedAt: true,
      },
    });

  // 장소에는 GAP Score가 아직 없는 경우
  if (!baseGap) {
    return {
      basePlace: {
        id: Number(place.id),
        name: place.name,
        categoryId:
          Number(place.categoryId),
        regionId:
          Number(
            place.districtRegionId,
          ),
        gapScore: null,
      },

      available: false,
      items: [],
    };
  }

  /*
   * 3. 같은 GAP 계산 회차(run) 안에서
   * 같은 지역 + 같은 카테고리 후보 조회
   */
  const candidates =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        runId: baseGap.runId,

        placeId: {
          not: place.id,
        },

        place: {
          status: 'ACTIVE',

          districtRegionId:
            place.districtRegionId,

          categoryId:
            place.categoryId,
        },
      },

      select: {
        gapScore: true,
        onlineScore: true,
        offlineScore: true,

        place: {
          select: {
            id: true,
            name: true,
            roadAddress: true,
            categoryId: true,
            districtRegionId: true,

            images: {
              where: {
                isActive: true,
              },

              orderBy: {
                displayOrder: 'asc',
              },

              take: 1,

              select: {
                originalUrl: true,
                thumbnailUrl: true,
              },
            },
          },
        },
      },
    });

  const baseGapScore =
    Number(baseGap.gapScore);

  /*
   * 4. GAP Score 차이가 작은 순서로 정렬
   */
  const items =
    candidates
      .map((candidate) => {
        const candidateGapScore =
          Number(candidate.gapScore);

        return {
          placeId:
            Number(candidate.place.id),

          placeName:
            candidate.place.name,

          categoryId:
            candidate.place.categoryId === null
              ? null
              : Number(
                  candidate.place.categoryId,
                ),

          regionId:
            candidate.place
              .districtRegionId === null
              ? null
              : Number(
                  candidate.place
                    .districtRegionId,
                ),

          roadAddress:
            candidate.place.roadAddress,

          imageUrl:
            candidate.place.images[0]
              ?.thumbnailUrl ??
            candidate.place.images[0]
              ?.originalUrl ??
            null,

          gapScore:
            candidateGapScore,

          gapDifference:
  Number(
    Math.abs(
      candidateGapScore -
        baseGapScore,
    ).toFixed(4),
  ),

          onlineScore:
            candidate.onlineScore === null
              ? null
              : Number(
                  candidate.onlineScore,
                ),

          offlineScore:
            candidate.offlineScore === null
              ? null
              : Number(
                  candidate.offlineScore,
                ),
        };
      })
      .sort(
        (a, b) =>
          a.gapDifference -
            b.gapDifference ||
          b.gapScore -
            a.gapScore,
      )
      .slice(
        0,
        safeLimit,
      );

  return {
    basePlace: {
      id:
        Number(place.id),

      name:
        place.name,

      categoryId:
        Number(place.categoryId),

      regionId:
        Number(
          place.districtRegionId,
        ),

      gapScore:
        baseGapScore,
    },

    run: {
      id:
        Number(baseGap.runId),

      formulaVersion:
        baseGap.formulaVersion,

      dataStage:
        baseGap.dataStage,

      calculatedAt:
        baseGap.calculatedAt,
    },

    available: true,

    items,
  };
}

async getGapMap(
  regionId?: number,
  categoryId?: number,
) {
  // GAP Score가 실제 존재하는 가장 최신 계산 회차
  const latestRun =
    await this.prisma.gapScoreRun.findFirst({
      where: {
        scores: {
          some: {},
        },
      },

      orderBy: [
        {
          calculatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: {
        id: true,
        formulaVersion: true,
        dataStage: true,
        calculatedAt: true,
      },
    });

  // 아직 GAP 계산 결과가 없는 경우
  if (!latestRun) {
    return {
      run: null,
      items: [],
      total: 0,
    };
  }

  /*
   * 상위 카테고리를 선택한 경우
   * 선택 카테고리 + 활성 직계 하위 카테고리까지 포함
   *
   * 예:
   * FOOD(1)
   * → FOOD + KOREAN / CHINESE / CAFE 등
   *
   * CAFE(15)
   * → CAFE만
   */
  let categoryIds:
    bigint[] | undefined;

  if (categoryId !== undefined) {
    const selectedCategoryId =
      BigInt(categoryId);

    const categories =
      await this.prisma.category.findMany({
        where: {
          isActive: true,

          OR: [
            {
              id:
                selectedCategoryId,
            },
            {
              parentId:
                selectedCategoryId,
            },
          ],
        },

        select: {
          id: true,
        },
      });

    categoryIds =
      categories.map(
        (category) =>
          category.id,
      );
  }

  const scores =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        runId: latestRun.id,

        place: {
          status: 'ACTIVE',

          // 지도 마커를 찍으려면 좌표가 반드시 있어야 함
          latitude: {
            not: null,
          },

          longitude: {
            not: null,
          },

          ...(regionId !== undefined && {
            districtRegionId:
              BigInt(regionId),
          }),

          ...(categoryIds !== undefined && {
            categoryId: {
              in: categoryIds,
            },
          }),
        },
      },

      orderBy: {
        gapScore: 'desc',
      },

      select: {
        gapScore: true,
        onlineScore: true,
        offlineScore: true,

        place: {
          select: {
            id: true,
            name: true,

            categoryId: true,
            districtRegionId: true,

            latitude: true,
            longitude: true,

            roadAddress: true,
          },
        },
      },
    });

  const items =
    scores.map((score) => ({
      placeId:
        Number(score.place.id),

      placeName:
        score.place.name,

      categoryId:
        score.place.categoryId === null
          ? null
          : Number(
              score.place.categoryId,
            ),

      regionId:
        score.place
          .districtRegionId === null
          ? null
          : Number(
              score.place
                .districtRegionId,
            ),

      latitude:
        Number(
          score.place.latitude,
        ),

      longitude:
        Number(
          score.place.longitude,
        ),

      roadAddress:
        score.place.roadAddress,

      gapScore:
        Number(score.gapScore),

      onlineScore:
        score.onlineScore === null
          ? null
          : Number(
              score.onlineScore,
            ),

      offlineScore:
        score.offlineScore === null
          ? null
          : Number(
              score.offlineScore,
            ),
    }));

  return {
    run: {
      id:
        Number(latestRun.id),

      formulaVersion:
        latestRun.formulaVersion,

      dataStage:
        latestRun.dataStage,

      calculatedAt:
        latestRun.calculatedAt,
    },

    items,

    total:
      items.length,
  };
}

async addFavorite(
  userId: number,
  placeId: number,
): Promise<
  | {
      placeId: number;
      isFavorite: boolean;
    }
  | undefined
> {
  // 활성 장소인지 확인
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

  if (!place) {
    return undefined;
  }

  // 이미 즐겨찾기한 장소여도 중복 생성하지 않음
  await this.prisma.placeFavorite.upsert({
    where: {
      userId_placeId: {
        userId: BigInt(userId),
        placeId: BigInt(placeId),
      },
    },

    update: {},

    create: {
      userId: BigInt(userId),
      placeId: BigInt(placeId),
    },
  });

  return {
    placeId,
    isFavorite: true,
  };
}

async removeFavorite(
  userId: number,
  placeId: number,
): Promise<
  | {
      placeId: number;
      isFavorite: boolean;
    }
  | undefined
> {
  // 활성 장소인지 확인
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

  if (!place) {
    return undefined;
  }

  // 즐겨찾기가 없더라도 에러 없이 처리
  await this.prisma.placeFavorite.deleteMany({
    where: {
      userId: BigInt(userId),
      placeId: BigInt(placeId),
    },
  });

  return {
    placeId,
    isFavorite: false,
  };
}


  async getVisitStatus(
  userId: number,
  placeId: number,
): Promise<{
  placeId: number;
  visited: boolean;
}> {
  const place =
    await this.prisma.place.findFirst({
      where: {
        id: BigInt(placeId),
        status: 'ACTIVE',
      },
      select: {
        id: true,
      },
    });

  if (!place) {
    throw new Error(
      'PLACE_NOT_FOUND',
    );
  }

  const verification =
    await this.prisma.visitVerification.findFirst({
      where: {
        userId: BigInt(userId),
        placeId: BigInt(placeId),
        status: 'VERIFIED',
      },
      select: {
        id: true,
      },
    });

  return {
    placeId,
    visited:
      verification !== null,
  };
}
}