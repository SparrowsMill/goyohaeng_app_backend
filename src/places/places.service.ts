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

  ownerIntro: string | null;

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
  const where = {
    status: 'ACTIVE',

    ...(regionId !== undefined && {
      districtRegionId: BigInt(regionId),
    }),

    ...(categoryId !== undefined && {
      categoryId: BigInt(categoryId),
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

    ownerIntro: place.ownerIntro,

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
  ): Promise<PlaceDetail | undefined> {
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

      ownerIntro: place.ownerIntro,

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