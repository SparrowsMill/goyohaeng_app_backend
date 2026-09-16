import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import {
  UploadsService,
} from '../uploads/uploads.service';

import {
  XP_PER_LEVEL,
} from './user-xp.util';



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
  visitedPlaceCount: number;

  topRegions: {
    regionId: number;
    regionName: string;
    visitCount: number;
  }[];
}

export interface SparrowProfileResponse {
  level: number;
  xp: number;
  xpForNextLevel: number;
  daysTogether: number;
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

  private readonly uploadsService:
    UploadsService,
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


  async getSparrowProfile(
  userId: number,
): Promise<
  SparrowProfileResponse | undefined
> {
  const user =
    await this.prisma.user.findFirst({
      where: {
        id: BigInt(userId),
        status: 'ACTIVE',
      },

      select: {
        level: true,
        xp: true,
        createdAt: true,
      },
    });

  if (!user) {
    return undefined;
  }

  const daysTogether =
    this.calculateDaysTogether(
      user.createdAt,
    );

  return {
    level:
      user.level,

    xp:
      user.xp,

    xpForNextLevel:
      XP_PER_LEVEL,

    daysTogether,
  };
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
      id: true,

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

    const visitedPlaceCount =
  new Set(
    verifiedVisits.map(
      (visit) =>
        visit.place.id.toString(),
    ),
  ).size;

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

      visitedPlaceCount,

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

    coordinateValidation: {
      is: {
        status: 'VALID',
      },
    },
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
  // 앱에 표시할 전체 활성 재료 조회
  const ingredients =
    await this.prisma.ingredient.findMany({
      where: {
        isActive: true,
      },

      orderBy: [
        {
          ingredientType: 'asc',
        },
        {
          id: 'asc',
        },
      ],
    });

  // 사용자가 실제로 보유한 재료 조회
  const userIngredients =
    await this.prisma.userIngredient.findMany({
      where: {
        userId: BigInt(userId),
      },
    });

  // ingredientId -> 사용자 보유 정보
  const balanceMap = new Map(
    userIngredients.map((item) => [
      item.ingredientId.toString(),
      item,
    ]),
  );

  const items = ingredients.map(
    (ingredient) => {
      const userIngredient =
        balanceMap.get(
          ingredient.id.toString(),
        );

      const quantity =
        userIngredient?.quantity ?? 0;

      return {
        id: Number(ingredient.id),

        name: ingredient.name,

        description:
          ingredient.description,

        ingredientType:
          ingredient.ingredientType,

        quantity,

        owned: quantity > 0,

        imageUrl:
          ingredient.imageUrl,

        illustrationUrl:
          ingredient.illustrationUrl,

        rarity:
          ingredient.rarity,

        regionId:
          ingredient.regionId === null
            ? null
            : Number(
                ingredient.regionId,
              ),

        firstAcquiredAt:
          userIngredient
            ?.firstAcquiredAt ?? null,

        updatedAt:
          userIngredient
            ?.updatedAt ?? null,
      };
    },
  );

  return {
    items,

    // 실제 한 개 이상 가진 재료 종류 수
    totalTypes: items.filter(
      (item) => item.quantity > 0,
    ).length,

    // 현재 가진 재료 총 수량
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

          specialIngredients: {
            include: {
              ingredient: true,

              sourcePlace: {
                select: {
                  id: true,
                  name: true,
                },
              },
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

        rarity:
          userFood.food.rarity,

        regionId:
          userFood.food.regionId === null
            ? null
            : Number(
                userFood.food.regionId,
              ),

        imageUrl:
          userFood.food.imageUrl,

        illustrationUrl:
          userFood.illustrationUrl ??
          userFood.food.illustrationUrl,

        madeAt:
          userFood.madeAt,

        specialIngredients:
  userFood.specialIngredients.map(
    (item) => ({
      ingredientId:
        Number(
          item.ingredient.id,
        ),

      name:
        item.ingredient.name,

      quantity:
        item.quantity,

      rarity:
        item.ingredient.rarity,

      imageUrl:
        item.ingredient.imageUrl,

      illustrationUrl:
        item.ingredient
          .illustrationUrl,

      sourcePlace:
        item.sourcePlace
          ? {
              id:
                Number(
                  item.sourcePlace.id,
                ),

              name:
                item.sourcePlace.name,
            }
          : null,
    }),
  ),
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

  async deleteAccount(
  id: number,
): Promise<boolean> {
  const user =
    await this.findById(id);

  if (!user) {
    return false;
  }

  const userId =
    BigInt(id);

  /*
   * 1. DB 데이터를 지우기 전에
   * 사용자가 발자국에 등록한
   * 이미지 URL을 확보한다.
   *
   * PostImage는 Post 삭제 시
   * CASCADE로 함께 삭제되므로
   * 반드시 먼저 URL을 가져와야 한다.
   */
  const postImages =
    await this.prisma.postImage.findMany({
      where: {
        post: {
          userId,
        },
      },

      select: {
        imageUrl: true,
      },
    });

  /*
   * 같은 URL이 중복되어 있을 경우
   * Cloudinary 삭제를 여러 번 호출하지 않는다.
   */
  const imageUrls =
    [
      ...new Set(
        postImages.map(
          (image) =>
            image.imageUrl,
        ),
      ),
    ];

  /*
   * 2. Cloudinary 실제 이미지 삭제
   *
   * DB를 먼저 삭제하면
   * 이미지 URL을 잃어버려
   * Cloudinary 파일을 다시 찾기 어려우므로
   * Cloudinary부터 정리한다.
   *
   * Cloudinary 삭제가 실패하면
   * 예외가 발생하고 DB 회원 삭제는 진행되지 않는다.
   */
  for (
    const imageUrl
    of imageUrls
  ) {
    await this.uploadsService
      .deleteImageByUrl(
        imageUrl,
      );
  }

  /*
   * 3. 사용자 관련 DB 데이터 삭제
   *
   * 하나라도 실패하면
   * 전체 DB 변경사항이 rollback 되도록
   * transaction으로 처리한다.
   */
  await this.prisma.$transaction(
    async (tx) => {
      /*
       * -------------------------------------------------
       * 사용자 삭제 전에
       * 다른 서비스 데이터에 남아 있는
       * nullable 사용자 FK를 제거한다.
       *
       * 장소 자체의 운영정보나 이미지는
       * 서비스 데이터이므로 삭제하지 않고
       * "누가 수정했는지" 연결만 제거한다.
       * -------------------------------------------------
       */

      await tx.placeImage.updateMany({
        where: {
          uploadedByUserId:
            userId,
        },

        data: {
          uploadedByUserId:
            null,
        },
      });

      await tx.businessAccount.updateMany({
        where: {
          reviewedByUserId:
            userId,
        },

        data: {
          reviewedByUserId:
            null,
        },
      });

      await tx.placeOperatingHour.updateMany({
        where: {
          updatedByUserId:
            userId,
        },

        data: {
          updatedByUserId:
            null,
        },
      });

      await tx.placeSpecialHour.updateMany({
        where: {
          updatedByUserId:
            userId,
        },

        data: {
          updatedByUserId:
            null,
        },
      });

      await tx.placeBenefit.updateMany({
        where: {
          createdByUserId:
            userId,
        },

        data: {
          createdByUserId:
            null,
        },
      });

      await tx.placeVerificationSetting.updateMany({
        where: {
          updatedByUserId:
            userId,
        },

        data: {
          updatedByUserId:
            null,
        },
      });

      await tx.placeIssueReport.updateMany({
        where: {
          resolvedByUserId:
            userId,
        },

        data: {
          resolvedByUserId:
            null,
        },
      });

      /*
       * -------------------------------------------------
       * 자식 데이터 삭제
       *
       * FK 관계 때문에 순서가 중요하다.
       * -------------------------------------------------
       */

      /*
       * IngredientTransaction은
       * User뿐 아니라
       * VisitVerification,
       * UserFood도 참조하므로
       * 가장 먼저 삭제한다.
       */
      await tx.ingredientTransaction.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 발자국 삭제
       *
       * PostImage는 Post에
       * onDelete: Cascade라 같이 삭제된다.
       */
      await tx.post.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 제작한 음식 삭제
       *
       * UserFoodSpecialIngredient는
       * UserFood에 onDelete: Cascade라
       * 함께 삭제된다.
       */
      await tx.userFood.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 방문 인증 이력 삭제
       */
      await tx.visitVerification.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 사용자가 제보한 장소 이슈 삭제
       */
      await tx.placeIssueReport.deleteMany({
        where: {
          reporterUserId:
            userId,
        },
      });

      /*
       * 사용자 개인 분석 이벤트 삭제
       */
      await tx.analyticsEvent.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 재료 보유 정보
       */
      await tx.userIngredient.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 즐겨찾기
       */
      await tx.placeFavorite.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 소셜 로그인 정보
       */
      await tx.userSocialAccount.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * 장소 관리자 계정이 있는 사용자라면
       * BusinessAccount도 삭제한다.
       *
       * 일반 사용자는 결과가 0건이므로
       * 문제없이 넘어간다.
       */
      await tx.businessAccount.deleteMany({
        where: {
          userId,
        },
      });

      /*
       * -------------------------------------------------
       * 마지막으로 User 자체 실제 삭제
       * -------------------------------------------------
       */
      await tx.user.delete({
        where: {
          id: userId,
        },
      });
    },
  );

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

  private calculateDaysTogether(
  createdAt: Date,
): number {
  const toSeoulDate =
    (date: Date): string => {
      const parts =
        new Intl.DateTimeFormat(
          'en-CA',
          {
            timeZone:
              'Asia/Seoul',

            year:
              'numeric',

            month:
              '2-digit',

            day:
              '2-digit',
          },
        ).formatToParts(
          date,
        );

      const year =
        parts.find(
          (part) =>
            part.type === 'year',
        )?.value;

      const month =
        parts.find(
          (part) =>
            part.type === 'month',
        )?.value;

      const day =
        parts.find(
          (part) =>
            part.type === 'day',
        )?.value;

      return `${year}-${month}-${day}`;
    };

  const createdDate =
    toSeoulDate(
      createdAt,
    );

  const today =
    toSeoulDate(
      new Date(),
    );

  const createdTimestamp =
    new Date(
      `${createdDate}T00:00:00.000Z`,
    ).getTime();

  const todayTimestamp =
    new Date(
      `${today}T00:00:00.000Z`,
    ).getTime();

  const difference =
    Math.floor(
      (
        todayTimestamp -
        createdTimestamp
      ) /
        (
          1000 *
          60 *
          60 *
          24
        ),
    );

  /*
   * "함께한 지 N일째" 기준.
   * 가입 당일은 1일째.
   */
  return Math.max(
    difference + 1,
    1,
  );
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