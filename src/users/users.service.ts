import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

export interface User {
  id: number;
  username: string;
  passwordHash: string;

  realName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;

  promotionNotificationEnabled: boolean;
  nearbyNotificationEnabled: boolean;
  recordNotificationEnabled: boolean;

  status: string;
  deletedAt: Date | null;
}

export interface DashboardResponse {
  monthlyVisitCount: number;
  ingredientCount: number;
  verifiedVisitCount: number;
  madeFoodCount: number;

  topRegions: {
    regionId: number;
    regionName: string;
    visitCount: number;
  }[];
}

interface CreateUserData {
  username: string;
  passwordHash: string;
  realName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender?: 'MALE' | 'FEMALE';
}

interface UpdateUserData {
  realName?: string;
  birthDate?: string;
  gender?: 'MALE' | 'FEMALE';

  promotionNotificationEnabled?: boolean;
  nearbyNotificationEnabled?: boolean;
  recordNotificationEnabled?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findByUsername(
    username: string,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findUnique({
        where: {
          username,
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async findById(
    id: number,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findFirst({
        where: {
          id: BigInt(id),
          status: 'ACTIVE',
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async findByEmail(
    email: string,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async create(
    data: CreateUserData,
  ): Promise<User> {
    const user =
      await this.prisma.user.create({
        data: {
          username: data.username,

          passwordHash:
            data.passwordHash,

          realName:
            data.realName,

          email:
            data.email,

          phone:
            data.phone,

          birthDate:
            this.stringToDate(
              data.birthDate,
            ),

          gender:
            data.gender,

          status:
            'ACTIVE',
        },
      });

    return this.toUser(user);
  }

  async update(
    id: number,
    data: UpdateUserData,
  ): Promise<User | undefined> {
    const existingUser =
      await this.findById(id);

    if (!existingUser) {
      return undefined;
    }

    const user =
      await this.prisma.user.update({
        where: {
          id: BigInt(id),
        },

        data: {
          ...(data.realName !==
            undefined && {
            realName:
              data.realName,
          }),

          ...(data.birthDate !==
            undefined && {
            birthDate:
              this.stringToDate(
                data.birthDate,
              ),
          }),

          ...(data.gender !==
            undefined && {
            gender:
              data.gender,
          }),

          ...(data
            .promotionNotificationEnabled !==
            undefined && {
            promotionNotificationEnabled:
              data
                .promotionNotificationEnabled,
          }),

          ...(data
            .nearbyNotificationEnabled !==
            undefined && {
            nearbyNotificationEnabled:
              data
                .nearbyNotificationEnabled,
          }),

          ...(data
            .recordNotificationEnabled !==
            undefined && {
            recordNotificationEnabled:
              data
                .recordNotificationEnabled,
          }),

          updatedAt:
            new Date(),
        },
      });

    return this.toUser(user);
  }

  /*
   * 메인 페이지 통계 조회
   */
  async getDashboard(
    userId: number,
  ): Promise<
    DashboardResponse | undefined
  > {
    /*
     * 현재 ACTIVE 사용자인지 확인
     */
    const user =
      await this.prisma.user.findFirst({
        where: {
          id: BigInt(userId),
          status: 'ACTIVE',
        },

        select: {
          id: true,
        },
      });

    if (!user) {
      return undefined;
    }

    /*
     * 한국 시간 기준
     * 이번 달 시작 ~ 다음 달 시작
     */
    const {
      monthStart,
      nextMonthStart,
    } =
      this.getCurrentMonthRangeInSeoul();

    /*
     * 서로 독립적인 통계이므로
     * 동시에 DB 조회
     */
    const [
      monthlyVisitCount,
      ingredientAggregate,
      verifiedVisitCount,
      madeFoodCount,
      verifiedVisits,
    ] = await Promise.all([
      /*
       * 이번 달 방문 횟수
       *
       * VERIFIED 된 시점이
       * 이번 달에 포함되는 인증 개수
       */
      this.prisma.visitVerification.count({
        where: {
          userId:
            BigInt(userId),

          status:
            'VERIFIED',

          verifiedAt: {
            gte:
              monthStart,

            lt:
              nextMonthStart,
          },
        },
      }),

      /*
       * 현재 보유한 재료 총 수량
       *
       * 예:
       * 쌀 2개 + 대파 1개
       * → ingredientCount = 3
       */
      this.prisma.userIngredient.aggregate({
        where: {
          userId:
            BigInt(userId),
        },

        _sum: {
          quantity: true,
        },
      }),

      /*
       * 지금까지 인증 완료한
       * 전체 방문 횟수
       */
      this.prisma.visitVerification.count({
        where: {
          userId:
            BigInt(userId),

          status:
            'VERIFIED',
        },
      }),

      /*
       * 사용자가 만든 음식 수
       */
      this.prisma.userFood.count({
        where: {
          userId:
            BigInt(userId),
        },
      }),

      /*
       * 방문 횟수 TOP3 지역 계산용
       *
       * VERIFIED 방문의 장소와
       * 장소가 속한 districtRegion 조회
       */
      this.prisma.visitVerification.findMany({
        where: {
          userId:
            BigInt(userId),

          status:
            'VERIFIED',
        },

        select: {
          place: {
            select: {
              districtRegion: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    /*
     * 지역별 방문 횟수 집계
     */
    const regionVisitMap =
      new Map<
        string,
        {
          regionId: number;
          regionName: string;
          visitCount: number;
        }
      >();

    for (
      const visit of verifiedVisits
    ) {
      const region =
        visit.place
          .districtRegion;

      /*
       * districtRegion이 없는 장소는
       * TOP3 계산에서 제외
       */
      if (!region) {
        continue;
      }

      const key =
        region.id.toString();

      const existing =
        regionVisitMap.get(
          key,
        );

      if (existing) {
        existing.visitCount += 1;
      } else {
        regionVisitMap.set(
          key,
          {
            regionId:
              Number(
                region.id,
              ),

            regionName:
              region.name,

            visitCount: 1,
          },
        );
      }
    }

    /*
     * 방문 횟수가 많은 순으로 정렬 후
     * 상위 3개만 반환
     */
    const topRegions =
      Array.from(
        regionVisitMap.values(),
      )
        .sort(
          (a, b) =>
            b.visitCount -
            a.visitCount,
        )
        .slice(0, 3);

    return {
      monthlyVisitCount,

      ingredientCount:
        ingredientAggregate
          ._sum
          .quantity ?? 0,

      verifiedVisitCount,

      madeFoodCount,

      topRegions,
    };
  }


  async getFavorites(
  userId: number,
  page: number = 1,
  limit: number = 20,
) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(
    Math.max(limit, 1),
    100,
  );

  const skip =
    (safePage - 1) * safeLimit;

  const where = {
    userId: BigInt(userId),

    place: {
      status: 'ACTIVE',
    },
  };

  const [favorites, total] =
    await Promise.all([
      this.prisma.placeFavorite.findMany({
        where,

        orderBy: {
          createdAt: 'desc',
        },

        skip,
        take: safeLimit,

        select: {
          createdAt: true,

          place: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              districtRegionId: true,
              roadAddress: true,
              latitude: true,
              longitude: true,

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

      this.prisma.placeFavorite.count({
        where,
      }),
    ]);

  return {
    items: favorites.map(
      (favorite) => ({
        id: Number(favorite.place.id),
        name: favorite.place.name,

        categoryId:
          favorite.place.categoryId
            ? Number(
                favorite.place.categoryId,
              )
            : null,

        districtRegionId:
          favorite.place
            .districtRegionId
            ? Number(
                favorite.place
                  .districtRegionId,
              )
            : null,

        roadAddress:
          favorite.place.roadAddress,

        latitude:
          favorite.place.latitude
            ? Number(
                favorite.place.latitude,
              )
            : null,

        longitude:
          favorite.place.longitude
            ? Number(
                favorite.place.longitude,
              )
            : null,

        imageUrl:
          favorite.place.images[0]
            ?.thumbnailUrl ??
          favorite.place.images[0]
            ?.originalUrl ??
          null,

        isFavorite: true,

        favoritedAt:
          favorite.createdAt,
      }),
    ),

    page: safePage,
    limit: safeLimit,
    total,
    totalPages:
      Math.ceil(total / safeLimit),
  };
}

async getIngredients(userId: number) {
  const userIngredients =
    await this.prisma.userIngredient.findMany({
      where: {
        userId: BigInt(userId),
        quantity: {
          gt: 0,
        },
      },

      include: {
        ingredient: true,
      },

      orderBy: {
        updatedAt: 'desc',
      },
    });

  const items = userIngredients.map(
    (item) => ({
      id: Number(item.ingredient.id),

      name: item.ingredient.name,

      description:
        item.ingredient.description,

      ingredientType:
        item.ingredient.ingredientType,

      quantity: item.quantity,

      imageUrl:
        item.ingredient.imageUrl,

      illustrationUrl:
        item.ingredient.illustrationUrl,

      rarity:
        item.ingredient.rarity,

      regionId:
        item.ingredient.regionId === null
          ? null
          : Number(
              item.ingredient.regionId,
            ),

      firstAcquiredAt:
        item.firstAcquiredAt,

      updatedAt:
        item.updatedAt,
    }),
  );

  return {
    items,
    totalTypes: items.length,
    totalQuantity: items.reduce(
      (sum, item) =>
        sum + item.quantity,
      0,
    ),
  };
}

async getMyFoods(
  userId: number,
  page: number = 1,
  limit: number = 20,
) {
  const safePage = Math.max(page, 1);

  const safeLimit = Math.min(
    Math.max(limit, 1),
    100,
  );

  const skip =
    (safePage - 1) * safeLimit;

  const where = {
    userId: BigInt(userId),
  };

  const [userFoods, total] =
    await Promise.all([
      this.prisma.userFood.findMany({
        where,

        orderBy: {
          madeAt: 'desc',
        },

        skip,
        take: safeLimit,

        include: {
          food: true,

          specialIngredient: true,

          specialSourcePlace: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),

      this.prisma.userFood.count({
        where,
      }),
    ]);

  return {
    items: userFoods.map(
      (userFood) => ({
        id: Number(userFood.id),

        foodId:
          Number(userFood.foodId),

        name:
          userFood.food.name,

        description:
          userFood.food.description,

        imageUrl:
          userFood.food.imageUrl,

        illustrationUrl:
          userFood.illustrationUrl ??
          userFood.food.illustrationUrl,

        madeAt:
          userFood.madeAt,

        specialIngredient:
          userFood.specialIngredient
            ? {
                id: Number(
                  userFood
                    .specialIngredient.id,
                ),

                name:
                  userFood
                    .specialIngredient.name,

                rarity:
                  userFood
                    .specialIngredient.rarity,
              }
            : null,

        specialSourcePlace:
          userFood.specialSourcePlace
            ? {
                id: Number(
                  userFood
                    .specialSourcePlace.id,
                ),

                name:
                  userFood
                    .specialSourcePlace.name,
              }
            : null,
      }),
    ),

    page: safePage,
    limit: safeLimit,
    total,

    totalPages:
      Math.ceil(total / safeLimit),
  };
}

  async changePassword(
    id: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user =
      await this.findById(id);

    if (!user) {
      return false;
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new BadRequestException(
        '현재 비밀번호가 올바르지 않습니다.',
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        10,
      );

    await this.prisma.user.update({
      where: {
        id: BigInt(id),
      },

      data: {
        passwordHash:
          newPasswordHash,

        updatedAt:
          new Date(),
      },
    });

    return true;
  }

  async softDelete(
    id: number,
  ): Promise<boolean> {
    const user =
      await this.findById(id);

    if (!user) {
      return false;
    }

    await this.prisma.user.update({
      where: {
        id: BigInt(id),
      },

      data: {
        status:
          'DELETED',

        deletedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    });

    return true;
  }

  /*
   * 한국 시간 기준
   * 현재 달의 시작/다음 달 시작을
   * UTC Date로 변환한다.
   *
   * DB verifiedAt이 timestamptz이므로
   * 이 값을 기준으로 조회한다.
   */
  private getCurrentMonthRangeInSeoul(): {
    monthStart: Date;
    nextMonthStart: Date;
  } {
    const now =
      new Date();

    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            'Asia/Seoul',

          year:
            'numeric',

          month:
            'numeric',
        },
      ).formatToParts(
        now,
      );

    const year =
      Number(
        parts.find(
          (part) =>
            part.type ===
            'year',
        )?.value,
      );

    const month =
      Number(
        parts.find(
          (part) =>
            part.type ===
            'month',
        )?.value,
      );

    /*
     * 예:
     * 한국시간 2026-09-01 00:00
     * = UTC 2026-08-31 15:00
     */
    const monthStart =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          -9,
          0,
          0,
        ),
      );

    /*
     * 다음 달 1일 00:00 KST
     */
    const nextMonthStart =
      new Date(
        Date.UTC(
          year,
          month,
          1,
          -9,
          0,
          0,
        ),
      );

    return {
      monthStart,
      nextMonthStart,
    };
  }

  private stringToDate(
    date: string,
  ): Date {
    return new Date(
      `${date}T00:00:00.000Z`,
    );
  }

  private dateToString(
    date: Date | null,
  ): string | null {
    if (!date) {
      return null;
    }

    return date
      .toISOString()
      .slice(0, 10);
  }

  private toUser(user: {
    id: bigint;
    username: string;
    passwordHash: string;
    realName: string | null;
    email: string | null;
    phone: string | null;
    birthDate: Date | null;
    gender: string | null;

    promotionNotificationEnabled: boolean;
    nearbyNotificationEnabled: boolean;
    recordNotificationEnabled: boolean;

    status: string;
    deletedAt: Date | null;
  }): User {
    return {
      id:
        Number(user.id),

      username:
        user.username,

      passwordHash:
        user.passwordHash,

      realName:
        user.realName,

      email:
        user.email,

      phone:
        user.phone,

      birthDate:
        this.dateToString(
          user.birthDate,
        ),

      gender:
        user.gender,

      promotionNotificationEnabled:
        user
          .promotionNotificationEnabled,

      nearbyNotificationEnabled:
        user
          .nearbyNotificationEnabled,

      recordNotificationEnabled:
        user
          .recordNotificationEnabled,

      status:
        user.status,

      deletedAt:
        user.deletedAt,
    };
  }
}