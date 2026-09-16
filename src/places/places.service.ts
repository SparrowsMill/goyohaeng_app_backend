import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type PlaceStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'CLOSED'
  | 'HIDDEN';

  export type OperatingStatus =
  | 'OPEN'
  | 'BEFORE_OPEN'
  | 'BREAK_TIME'
  | 'CLOSED'
  | 'DAY_OFF'
  | 'UNKNOWN';

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

  /*
   * 최신 production GAP run 기준
   * GAP 정보가 없는 장소는 null
   */
  gapScore: number | null;
  gapPercentile: number | null;

  onlineScore: number | null;
  offlineScore: number | null;

  calculatedAt: Date | null;
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

  operatingStatus: OperatingStatus;

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

private async getLatestProductionGapRun() {
  return this.prisma.gapScoreRun.findFirst({
    where: {
      formulaVersion: 'GAP_V1_PROXY',
      dataStage: 'COLD_START',

      // 실제 score가 생성된 run만 사용
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
}

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
      districtRegionId:
        BigInt(regionId),
    }),

    ...(categoryIds !== undefined && {
      categoryId: {
        in: categoryIds,
      },
    }),
  };

  const skip =
    (page - 1) * limit;

  /*
   * 장소 목록과 전체 개수,
   * 최신 production GAP run을 병렬 조회
   */
  const [
    places,
    total,
    latestRun,
  ] =
    await Promise.all([
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

      this.getLatestProductionGapRun(),
    ]);

  /*
   * 목록에 포함된 장소들의 GAP를
   * 한 번의 쿼리로 조회한다.
   *
   * 장소별 findFirst를 반복하지 않으므로
   * N+1 문제가 발생하지 않는다.
   */
  const gapScores =
    latestRun &&
    places.length > 0
      ? await this.prisma.gapScoreHistory.findMany({
          where: {
            runId:
              latestRun.id,

            placeId: {
              in:
                places.map(
                  (place) =>
                    place.id,
                ),
            },
          },

          select: {
            placeId: true,

            gapScore: true,
            gapPercentile: true,

            onlineScore: true,
            offlineScore: true,

            calculatedAt: true,
          },
        })
      : [];

  /*
   * placeId -> GAP
   * 빠르게 찾기 위한 Map
   */
  const gapByPlaceId =
    new Map(
      gapScores.map(
        (score) =>
          [
            score.placeId.toString(),
            score,
          ] as const,
      ),
    );

  const items: Place[] =
    places.map((place) => {
      const gap =
        gapByPlaceId.get(
          place.id.toString(),
        );

      return {
        id:
          Number(place.id),

        name:
          place.name,

        categoryId:
          place.categoryId === null
            ? null
            : Number(
                place.categoryId,
              ),

        districtRegionId:
          place.districtRegionId === null
            ? null
            : Number(
                place.districtRegionId,
              ),

        adminDongRegionId:
          place.adminDongRegionId === null
            ? null
            : Number(
                place.adminDongRegionId,
              ),

        legalDongRegionId:
          place.legalDongRegionId === null
            ? null
            : Number(
                place.legalDongRegionId,
              ),

        roadAddress:
          place.roadAddress,

        lotAddress:
          place.lotAddress,

        postalCode:
          place.postalCode,

        latitude:
          place.latitude === null
            ? null
            : Number(
                place.latitude,
              ),

        longitude:
          place.longitude === null
            ? null
            : Number(
                place.longitude,
              ),

        phone:
          place.phone,

        homepage:
          place.homepage,

        overview:
          place.overview,

        status:
          place.status,

        /*
         * 최신 production run에
         * GAP가 없는 장소는 null
         */
        gapScore:
          gap
            ? Number(
                gap.gapScore,
              )
            : null,

        gapPercentile:
          gap?.gapPercentile ===
          null ||
          gap?.gapPercentile ===
          undefined
            ? null
            : Number(
                gap.gapPercentile,
              ),

        onlineScore:
          gap?.onlineScore ===
          null ||
          gap?.onlineScore ===
          undefined
            ? null
            : Number(
                gap.onlineScore,
              ),

        offlineScore:
          gap?.offlineScore ===
          null ||
          gap?.offlineScore ===
          undefined
            ? null
            : Number(
                gap.offlineScore,
              ),

        calculatedAt:
          gap?.calculatedAt ??
          null,
      };
    });

  return {
    items,

    page,
    limit,
    total,

    totalPages:
      Math.ceil(
        total / limit,
      ),
  };
}

  async findById(
  id: number,
  userId: number,
): Promise<PlaceDetail | undefined> {
  const now =
    new Date();

  /*
   * 장소 상세와 최신 production GAP run을
   * 동시에 조회
   */
  const [
    place,
    latestRun,
  ] =
    await Promise.all([
      this.prisma.place.findFirst({
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
                      validFrom:
                        null,
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
                      validUntil:
                        null,
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
              createdAt:
                'desc',
            },
          },

          verificationSetting:
            true,

          ingredientRewards: {
            where: {
              isActive: true,
            },

            include: {
              ingredient: true,
            },
          },
        },
      }),

      this.getLatestProductionGapRun(),
    ]);

  if (!place) {
    return undefined;
  }

  /*
   * 즐겨찾기 여부
   */
  const favorite =
    await this.prisma.placeFavorite.findUnique({
      where: {
        userId_placeId: {
          userId:
            BigInt(userId),

          placeId:
            BigInt(id),
        },
      },

      select: {
        userId: true,
      },
    });

  const isFavorite =
    !!favorite;

  /*
   * 장소별 최신 history가 아니라
   * 현재 production run 안의 GAP만 조회
   */
  const gap =
    latestRun
      ? await this.prisma.gapScoreHistory.findFirst({
          where: {
            runId:
              latestRun.id,

            placeId:
              place.id,
          },

          select: {
            gapScore: true,
            gapPercentile: true,

            onlineScore: true,
            offlineScore: true,

            calculatedAt: true,
          },
        })
      : null;

  const operatingHours:
    PlaceOperatingHour[] =
    place.operatingHours.map(
      (hours) => ({
        dayOfWeek:
          hours.dayOfWeek,

        isClosed:
          hours.isClosed,

        openTime:
          this.formatTime(
            hours.openTime,
          ),

        closeTime:
          this.formatTime(
            hours.closeTime,
          ),

        breakStartTime:
          this.formatTime(
            hours.breakStartTime,
          ),

        breakEndTime:
          this.formatTime(
            hours.breakEndTime,
          ),
      }),
    );

  const operatingStatus =
    this.calculateOperatingStatus(
      place.operatingHours,
      place.specialHours,
    );

  const isOpenNow =
    operatingStatus === 'OPEN';

  return {
    id:
      Number(place.id),

    name:
      place.name,

    categoryId:
      place.categoryId === null
        ? null
        : Number(
            place.categoryId,
          ),

    districtRegionId:
      place.districtRegionId === null
        ? null
        : Number(
            place.districtRegionId,
          ),

    adminDongRegionId:
      place.adminDongRegionId === null
        ? null
        : Number(
            place.adminDongRegionId,
          ),

    legalDongRegionId:
      place.legalDongRegionId === null
        ? null
        : Number(
            place.legalDongRegionId,
          ),

    roadAddress:
      place.roadAddress,

    lotAddress:
      place.lotAddress,

    postalCode:
      place.postalCode,

    latitude:
      place.latitude === null
        ? null
        : Number(
            place.latitude,
          ),

    longitude:
      place.longitude === null
        ? null
        : Number(
            place.longitude,
          ),

    phone:
      place.phone,

    homepage:
      place.homepage,

    overview:
      place.overview,

    status:
      place.status,

    /*
     * 최신 production GAP 정보
     */
    gapScore:
      gap
        ? Number(
            gap.gapScore,
          )
        : null,

    gapPercentile:
      gap?.gapPercentile === null ||
      gap?.gapPercentile === undefined
        ? null
        : Number(
            gap.gapPercentile,
          ),

    onlineScore:
      gap?.onlineScore === null ||
      gap?.onlineScore === undefined
        ? null
        : Number(
            gap.onlineScore,
          ),

    offlineScore:
      gap?.offlineScore === null ||
      gap?.offlineScore === undefined
        ? null
        : Number(
            gap.offlineScore,
          ),

    calculatedAt:
      gap?.calculatedAt ??
      null,

    images:
      place.images.map(
        (image) => ({
          id:
            Number(image.id),

          placeId:
            Number(
              image.placeId,
            ),

          originalUrl:
            image.originalUrl,

          thumbnailUrl:
            image.thumbnailUrl,

          displayOrder:
            image.displayOrder,
        }),
      ),

    operatingHours,

    isOpenNow,

    operatingStatus,

    benefits:
      place.benefits.map(
        (benefit) => ({
          id:
            Number(
              benefit.id,
            ),

          title:
            benefit.title,

          description:
            benefit.description,
        }),
      ),

    availableIngredients:
      place.ingredientRewards.map(
        (reward) => ({
          id:
            Number(
              reward.ingredient.id,
            ),

          name:
            reward.ingredient.name,

          imageUrl:
            reward.ingredient.imageUrl,

          rarity:
            reward.ingredient.rarity,

          quantity:
            reward.quantity,

          rewardRule:
            reward.rewardRule,
        }),
      ),

    verification:
      place.verificationSetting ===
      null
        ? null
        : {
            enabled:
              place
                .verificationSetting
                .enabled,

            controlMode:
              place
                .verificationSetting
                .controlMode,

            hoursMode:
              place
                .verificationSetting
                .hoursMode,

            codeValidMinutes:
              place
                .verificationSetting
                .codeValidMinutes,
          },

    isFavorite,
  };
}

private calculateOperatingStatus(
  operatingHours: Array<{
    dayOfWeek: number;
    isClosed: boolean;
    is24Hours: boolean;
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
): OperatingStatus {
  const now = new Date();

  /*
   * 서버 위치와 관계없이
   * 현재 시간을 Asia/Seoul 기준으로 계산
   */
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

  const getPart = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value;

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const weekday =
    getPart('weekday');

  const hour =
    Number(getPart('hour'));

  const minute =
    Number(getPart('minute'));

  if (
    !year ||
    !month ||
    !day ||
    !weekday ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return 'UNKNOWN';
  }

  const today =
    `${year}-${month}-${day}`;

  const currentMinutes =
    hour * 60 + minute;

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
    return 'UNKNOWN';
  }

  /*
   * ==================================================
   * 1. 오늘 특별 영업정보 확인
   *
   * 특별 영업정보가 있으면
   * 일반 주간 영업정보보다 우선한다.
   * ==================================================
   */
  const todaySpecial =
    specialHours.find(
      (specialHour) =>
        specialHour.targetDate
          .toISOString()
          .slice(0, 10) ===
        today,
    );

  if (todaySpecial) {
    /*
     * 명시적인 특별 휴무
     */
    if (
      todaySpecial.scheduleType ===
      'CLOSED'
    ) {
      return 'DAY_OFF';
    }

    /*
     * 특별 영업일
     */
    if (
      todaySpecial.scheduleType ===
      'SPECIAL_OPEN'
    ) {
      return this.evaluateScheduleStatus(
        currentMinutes,
        todaySpecial.openTime,
        todaySpecial.closeTime,
        todaySpecial.breakStartTime,
        todaySpecial.breakEndTime,
      );
    }
  }

  /*
   * ==================================================
   * 2. 전날 시작한 심야 영업이
   * 오늘 새벽까지 이어지는지 확인
   *
   * 예:
   * 화요일 18:00 ~ 수요일 02:00
   *
   * 수요일 01:00에도 OPEN이어야 한다.
   * ==================================================
   */
  const previousDate =
    new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
      ),
    );

  previousDate.setUTCDate(
    previousDate.getUTCDate() - 1,
  );

  const previousDateString =
    previousDate
      .toISOString()
      .slice(0, 10);

  const previousDayOfWeek =
    dayOfWeek === 1
      ? 7
      : dayOfWeek - 1;

  const previousSpecial =
    specialHours.find(
      (specialHour) =>
        specialHour.targetDate
          .toISOString()
          .slice(0, 10) ===
        previousDateString,
    );

  let previousSchedule:
    | {
        openTime: Date | null;
        closeTime: Date | null;
        breakStartTime:
          Date | null;
        breakEndTime:
          Date | null;
      }
    | null = null;

  /*
   * 전날 특별 영업이 있었다면
   * 그 시간을 우선 사용
   */
  if (
    previousSpecial
      ?.scheduleType ===
    'SPECIAL_OPEN'
  ) {
    previousSchedule = {
      openTime:
        previousSpecial.openTime,

      closeTime:
        previousSpecial.closeTime,

      breakStartTime:
        previousSpecial
          .breakStartTime,

      breakEndTime:
        previousSpecial
          .breakEndTime,
    };
  } else if (
    previousSpecial
      ?.scheduleType !==
    'CLOSED'
  ) {
    /*
     * 전날 특별 휴무가 아니면
     * 일반 주간 영업시간 확인
     */
    const previousHours =
      operatingHours.find(
        (hours) =>
          hours.dayOfWeek ===
          previousDayOfWeek,
      );

    if (
      previousHours &&
      !previousHours.isClosed
    ) {
      previousSchedule = {
        openTime:
          previousHours.openTime,

        closeTime:
          previousHours.closeTime,

        breakStartTime:
          previousHours
            .breakStartTime,

        breakEndTime:
          previousHours
            .breakEndTime,
      };
    }
  }

  if (
    previousSchedule?.openTime &&
    previousSchedule?.closeTime
  ) {
    const previousOpenMinutes =
      this.dateTimeToMinutes(
        previousSchedule.openTime,
      );

    const previousCloseMinutes =
      this.dateTimeToMinutes(
        previousSchedule.closeTime,
      );

    /*
     * close < open이면 자정을 넘긴 영업
     *
     * 예:
     * 18:00 -> 02:00
     */
    const isOvernight =
      previousCloseMinutes <
      previousOpenMinutes;

    /*
     * 전날 영업의 새벽 구간
     */
    if (
      isOvernight &&
      currentMinutes <
        previousCloseMinutes
    ) {
      if (
        this.isInBreakTime(
          currentMinutes,
          previousSchedule
            .breakStartTime,
          previousSchedule
            .breakEndTime,
        )
      ) {
        return 'BREAK_TIME';
      }

      return 'OPEN';
    }
  }

  /*
   * ==================================================
   * 3. 오늘 일반 영업시간 확인
   * ==================================================
   */
  const todayHours =
    operatingHours.find(
      (hours) =>
        hours.dayOfWeek ===
        dayOfWeek,
    );

  /*
   * 오늘 영업시간 데이터 자체가 없음
   */
  if (!todayHours) {
    return 'UNKNOWN';
  }

  /*
   * DB에서 명시적으로 휴무 처리된 날
   */
  if (todayHours.isClosed) {
  return 'DAY_OFF';
}

/*
 * 24시간 영업
 *
 * 기존 isOpenDuring24Hours()를 사용해서
 * 브레이크타임까지 반영한다.
 */
if (todayHours.is24Hours) {
  const isOpen =
    this.isOpenDuring24Hours(
      currentMinutes,
      todayHours.breakStartTime,
      todayHours.breakEndTime,
    );

  if (isOpen === null) {
    return 'UNKNOWN';
  }

  return isOpen
    ? 'OPEN'
    : 'BREAK_TIME';
}

/*
 * 일반 영업 상태 계산
 */
return this.evaluateScheduleStatus(
  currentMinutes,
  todayHours.openTime,
  todayHours.closeTime,
  todayHours.breakStartTime,
  todayHours.breakEndTime,
);
}

private calculateIsOpenNow(
  operatingHours: Array<{
    dayOfWeek: number;
    isClosed: boolean;
    is24Hours: boolean;
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
  return (
    this.calculateOperatingStatus(
      operatingHours,
      specialHours,
    ) === 'OPEN'
  );
}

private evaluateScheduleStatus(
  currentMinutes: number,
  openTime: Date | null,
  closeTime: Date | null,
  breakStartTime: Date | null,
  breakEndTime: Date | null,
): OperatingStatus {
  /*
   * 시작/종료 시간이 없으면
   * 영업 여부를 확정할 수 없음
   */
  if (
    !openTime ||
    !closeTime
  ) {
    return 'UNKNOWN';
  }

  const openMinutes =
    this.dateTimeToMinutes(
      openTime,
    );

  const closeMinutes =
    this.dateTimeToMinutes(
      closeTime,
    );

  /*
   * 시작과 종료가 동일한 경우
   * 현재 데이터만으로는
   * 24시간 영업인지 잘못된 데이터인지
   * 판단할 수 없으므로 UNKNOWN
   */
  if (
    openMinutes ===
    closeMinutes
  ) {
    return 'UNKNOWN';
  }

  /*
   * 일반 영업시간
   *
   * 예:
   * 10:00 ~ 22:00
   */
  if (
    closeMinutes >
    openMinutes
  ) {
    /*
     * 영업 시작 전
     */
    if (
      currentMinutes <
      openMinutes
    ) {
      return 'BEFORE_OPEN';
    }

    /*
     * 영업 종료 후
     */
    if (
      currentMinutes >=
      closeMinutes
    ) {
      return 'CLOSED';
    }

    /*
     * 영업시간 안이지만
     * 브레이크타임
     */
    if (
      this.isInBreakTime(
        currentMinutes,
        breakStartTime,
        breakEndTime,
      )
    ) {
      return 'BREAK_TIME';
    }

    return 'OPEN';
  }

  /*
   * 자정을 넘기는 영업시간
   *
   * 예:
   * 18:00 ~ 02:00
   *
   * 오늘 날짜의 영업은
   * openTime 이후부터 시작한다.
   * 새벽 구간은 위에서 전날 영업으로 처리한다.
   */
  if (
    currentMinutes <
    openMinutes
  ) {
    return 'BEFORE_OPEN';
  }

  if (
    this.isInBreakTime(
      currentMinutes,
      breakStartTime,
      breakEndTime,
    )
  ) {
    return 'BREAK_TIME';
  }

  return 'OPEN';
}

private isInBreakTime(
  currentMinutes: number,
  breakStartTime: Date | null,
  breakEndTime: Date | null,
): boolean {
  if (
    !breakStartTime ||
    !breakEndTime
  ) {
    return false;
  }

  const breakStart =
    this.dateTimeToMinutes(
      breakStartTime,
    );

  const breakEnd =
    this.dateTimeToMinutes(
      breakEndTime,
    );

  /*
   * 시작과 끝이 같으면
   * 브레이크타임 없음으로 처리
   */
  if (
    breakStart === breakEnd
  ) {
    return false;
  }

  /*
   * 일반 브레이크
   *
   * 예:
   * 15:00 ~ 17:00
   */
  if (
    breakEnd >
    breakStart
  ) {
    return (
      currentMinutes >=
        breakStart &&
      currentMinutes <
        breakEnd
    );
  }

  /*
   * 자정을 넘기는 브레이크
   *
   * 예:
   * 23:30 ~ 00:30
   */
  return (
    currentMinutes >=
      breakStart ||
    currentMinutes <
      breakEnd
  );
}

private isOpenDuring24Hours(
  currentMinutes: number,
  breakStartTime: Date | null,
  breakEndTime: Date | null,
): boolean | null {
  /*
   * 24시간 영업 + 브레이크 없음
   */
  if (
    !breakStartTime &&
    !breakEndTime
  ) {
    return true;
  }

  /*
   * 브레이크 정보가 한쪽만 존재
   */
  if (
    !breakStartTime ||
    !breakEndTime
  ) {
    return null;
  }

  const breakStart =
    this.dateTimeToMinutes(
      breakStartTime,
    );

  const breakEnd =
    this.dateTimeToMinutes(
      breakEndTime,
    );

  /*
   * 시작과 종료가 같으면
   * 브레이크 시간 범위를
   * 판단할 수 없음
   */
  if (
    breakStart ===
    breakEnd
  ) {
    return null;
  }

  /*
   * 일반 브레이크
   *
   * 예:
   * 15:00 ~ 16:00
   */
  if (
    breakStart <
    breakEnd
  ) {
    const isBreakTime =
      currentMinutes >=
        breakStart &&
      currentMinutes <
        breakEnd;

    return !isBreakTime;
  }

  /*
   * 자정을 넘는 브레이크
   *
   * 예:
   * 23:30 ~ 00:30
   */
  const isBreakTime =
    currentMinutes >=
      breakStart ||
    currentMinutes <
      breakEnd;

  return !isBreakTime;
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
  /*
   * 1. 활성 장소 확인
   */
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
   * 2. 현재 production에서 사용할
   * 최신 GAP run을 하나만 선택
   */
  const latestRun =
    await this.getLatestProductionGapRun();

  /*
   * 아직 유효한 GAP run 자체가 없는 경우
   */
  if (!latestRun) {
    return {
      placeId: Number(place.id),
      placeName: place.name,

      available: false,

      gapScore: null,
      gapPercentile: null,

      regionCategoryAverageGapScore:
        null,

      onlineScore: null,
      offlineScore: null,

      percentiles: null,

      explanation: null,

      formulaVersion: null,
      dataStage: null,
      calculatedAt: null,
      runId: null,
      gapMetricMappingId: null,
    };
  }

  /*
   * 3. 장소별 최신 history를 찾지 않고
   * 위에서 선택한 동일 run의 score만 조회
   */
  const gap =
    await this.prisma.gapScoreHistory.findFirst({
      where: {
        placeId: BigInt(placeId),
        runId: latestRun.id,
      },

      select: {
        id: true,

        gapScore: true,
        gapPercentile: true,

        onlineScore: true,
        offlineScore: true,

        naverPercentile: true,
        snsPercentile: true,
        navigationPercentile: true,

        visitorPercentile: true,
        expenditurePercentile: true,
        nonlocalVisitorPercentile: true,

        explanationText: true,

        calculatedAt: true,

        runId: true,
        gapMetricMappingId: true,
      },
    });

  /*
   * 장소는 존재하지만
   * 최신 production run에 이 장소의 GAP가 없는 경우
   */
  if (!gap) {
    return {
      placeId: Number(place.id),
      placeName: place.name,

      available: false,

      gapScore: null,
      gapPercentile: null,

      regionCategoryAverageGapScore:
        null,

      onlineScore: null,
      offlineScore: null,

      percentiles: null,

      explanation: null,

      formulaVersion:
        latestRun.formulaVersion,

      dataStage:
        latestRun.dataStage,

      calculatedAt:
        latestRun.calculatedAt,

      runId:
        Number(latestRun.id),

      gapMetricMappingId: null,
    };
  }

  /*
   * 4. 동일 run 안에서
   * 같은 지역 + 같은 카테고리 평균 GAP 계산
   */
  let regionCategoryAverageGapScore:
    number | null = null;

  if (
    place.districtRegionId !== null &&
    place.categoryId !== null
  ) {
    const average =
      await this.prisma.gapScoreHistory.aggregate({
        where: {
          runId: latestRun.id,

          place: {
            status: 'ACTIVE',

            districtRegionId:
              place.districtRegionId,

            categoryId:
              place.categoryId,
          },
        },

        _avg: {
          gapScore: true,
        },
      });

    regionCategoryAverageGapScore =
      average._avg.gapScore === null
        ? null
        : Number(
            average._avg.gapScore,
          );
  }

  return {
    placeId: Number(place.id),
    placeName: place.name,

    available: true,

    gapScore:
      Number(gap.gapScore),

    gapPercentile:
      gap.gapPercentile === null
        ? null
        : Number(
            gap.gapPercentile,
          ),

    regionCategoryAverageGapScore,

    onlineScore:
      gap.onlineScore === null
        ? null
        : Number(
            gap.onlineScore,
          ),

    offlineScore:
      gap.offlineScore === null
        ? null
        : Number(
            gap.offlineScore,
          ),

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
        gap.navigationPercentile ===
        null
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
        gap.expenditurePercentile ===
        null
          ? null
          : Number(
              gap.expenditurePercentile,
            ),

      nonlocalVisitor:
        gap.nonlocalVisitorPercentile ===
        null
          ? null
          : Number(
              gap.nonlocalVisitorPercentile,
            ),
    },

    explanation:
      gap.explanationText,

    formulaVersion:
      latestRun.formulaVersion,

    dataStage:
      latestRun.dataStage,

    calculatedAt:
      gap.calculatedAt,

    runId:
      Number(latestRun.id),

    gapMetricMappingId:
      Number(
        gap.gapMetricMappingId,
      ),
  };
}

async getGapHistory(
  placeId: number,
  period: '7d' | '1m' | '3m',
) {
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

  const now =
    new Date();

  const startDate =
    new Date(now);

  switch (period) {
    case '7d':
      startDate.setUTCDate(
        startDate.getUTCDate() - 7,
      );
      break;

    case '1m':
      startDate.setUTCMonth(
        startDate.getUTCMonth() - 1,
      );
      break;

    case '3m':
      startDate.setUTCMonth(
        startDate.getUTCMonth() - 3,
      );
      break;
  }

  /*
   * 해당 기간 내 존재하는 GAP 계산 회차만 반환.
   * 계산되지 않은 날짜에 대해서는
   * 임의의 값을 생성하거나 보간하지 않음.
   */
  const history =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        placeId:
          BigInt(placeId),

        calculatedAt: {
          gte: startDate,
          lte: now,
        },
      },

      orderBy: [
        {
          calculatedAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        calculatedAt: true,
        gapScore: true,
      },
    });

  return {
    placeId:
      Number(place.id),

    period,

    items:
      history.map(
        (item) => ({
          calculatedAt:
            item.calculatedAt,

          gapScore:
            Number(
              item.gapScore,
            ),
        }),
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

  /*
   * 모든 GAP API에서 공통으로 사용하는
   * 최신 production GAP run 조회
   *
   * formulaVersion = GAP_V1_PROXY
   * dataStage = COLD_START
   */
  const latestRun =
    await this.getLatestProductionGapRun();

  /*
   * 아직 production GAP 계산 결과가 없는 경우
   */
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

  /*
   * 위에서 선택한 단 하나의 production run만 사용
   */
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

        /*
         * 기존 GAP Score 순위 정책 유지
         *
         * gapPercentile도 응답에는 제공하지만
         * 기존 랭킹 정렬 동작은 바꾸지 않는다.
         */
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
          gapPercentile: true,

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

              /*
               * 방문 인증 활성화 여부
               */
              verificationSetting: {
                select: {
                  enabled: true,
                },
              },

              /*
               * 현재 영업 상태 계산용
               */
              operatingHours: {
                select: {
                  dayOfWeek: true,
                  isClosed: true,
                  is24Hours: true,

                  openTime: true,
                  closeTime: true,

                  breakStartTime: true,
                  breakEndTime: true,
                },
              },

              /*
               * 특정 날짜 운영 일정 / 임시 휴무
               */
              specialHours: {
                select: {
                  targetDate: true,
                  scheduleType: true,

                  openTime: true,
                  closeTime: true,

                  breakStartTime: true,
                  breakEndTime: true,
                },
              },

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

          /*
           * 방문 인증 기능 활성화 여부
           */
          verificationAvailable:
            score.place
              .verificationSetting
              ?.enabled ?? false,

          /*
           * 현재 영업 여부 및 세부 상태
           */
          isOpenNow:
            this.calculateIsOpenNow(
              score.place.operatingHours,
              score.place.specialHours,
            ),

          operatingStatus:
            this.calculateOperatingStatus(
              score.place.operatingHours,
              score.place.specialHours,
            ),

          imageUrl:
            score.place.images[0]
              ?.thumbnailUrl ??
            score.place.images[0]
              ?.originalUrl ??
            null,

          gapScore:
            Number(score.gapScore),

          gapPercentile:
            score.gapPercentile === null
              ? null
              : Number(
                  score.gapPercentile,
                ),

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

  /*
   * 1. 기준 장소 조회
   */
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
            : Number(
                place.categoryId,
              ),

        regionId:
          place.districtRegionId === null
            ? null
            : Number(
                place.districtRegionId,
              ),

        gapScore: null,
        gapPercentile: null,
      },

      run: null,

      available: false,
      items: [],
    };
  }

  /*
   * 2. 모든 GAP API와 동일한
   * 최신 production run 선택
   *
   * GAP_V1_PROXY + COLD_START
   */
  const latestRun =
    await this.getLatestProductionGapRun();

  if (!latestRun) {
    return {
      basePlace: {
        id: Number(place.id),
        name: place.name,

        categoryId:
          Number(place.categoryId),

        regionId:
          Number(place.districtRegionId),

        gapScore: null,
        gapPercentile: null,
      },

      run: null,

      available: false,
      items: [],
    };
  }

  /*
   * 3. 기준 장소의 GAP는
   * latest production run에서만 조회
   */
  const baseGap =
    await this.prisma.gapScoreHistory.findFirst({
      where: {
        placeId: place.id,
        runId: latestRun.id,
      },

      select: {
        gapScore: true,
        gapPercentile: true,
      },
    });

  /*
   * 최신 production run에
   * 기준 장소의 GAP가 없는 경우
   */
  if (!baseGap) {
    return {
      basePlace: {
        id: Number(place.id),
        name: place.name,

        categoryId:
          Number(place.categoryId),

        regionId:
          Number(place.districtRegionId),

        gapScore: null,
        gapPercentile: null,
      },

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

      available: false,
      items: [],
    };
  }

  /*
   * 4. 동일한 production run 안에서
   * 같은 지역 + 같은 카테고리 후보 조회
   */
  const candidates =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        runId: latestRun.id,

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
        gapPercentile: true,

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

            /*
             * 현재 영업 상태 계산용
             */
            operatingHours: {
              select: {
                dayOfWeek: true,
                isClosed: true,
                is24Hours: true,

                openTime: true,
                closeTime: true,

                breakStartTime: true,
                breakEndTime: true,
              },
            },

            /*
             * 특정 날짜 특별 운영 / 임시 휴무
             */
            specialHours: {
              select: {
                targetDate: true,
                scheduleType: true,

                openTime: true,
                closeTime: true,

                breakStartTime: true,
                breakEndTime: true,
              },
            },
          },
        },
      },
    });

  const baseGapScore =
    Number(
      baseGap.gapScore,
    );

  const baseGapPercentile =
    baseGap.gapPercentile === null
      ? null
      : Number(
          baseGap.gapPercentile,
        );

  /*
   * 5. 기존 추천 정책 유지:
   * GAP Score 차이가 작은 장소 우선
   */
  const items =
    candidates
      .map((candidate) => {
        const candidateGapScore =
          Number(
            candidate.gapScore,
          );

        return {
          placeId:
            Number(
              candidate.place.id,
            ),

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
            candidate.place
              .roadAddress,

          imageUrl:
            candidate.place.images[0]
              ?.thumbnailUrl ??
            candidate.place.images[0]
              ?.originalUrl ??
            null,

          isOpenNow:
            this.calculateIsOpenNow(
              candidate.place
                .operatingHours,
              candidate.place
                .specialHours,
            ),

          operatingStatus:
            this.calculateOperatingStatus(
              candidate.place
                .operatingHours,
              candidate.place
                .specialHours,
            ),

          gapScore:
            candidateGapScore,

          gapPercentile:
            candidate.gapPercentile === null
              ? null
              : Number(
                  candidate.gapPercentile,
                ),

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
        Number(
          place.categoryId,
        ),

      regionId:
        Number(
          place.districtRegionId,
        ),

      gapScore:
        baseGapScore,

      gapPercentile:
        baseGapPercentile,
    },

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

    available: true,

    items,
  };
}

async getGapMap(
  regionId?: number,
  categoryId?: number,
) {
  /*
   * 모든 GAP API에서 공통으로 사용하는
   * 최신 production GAP run
   *
   * GAP_V1_PROXY + COLD_START
   */
  const latestRun =
    await this.getLatestProductionGapRun();

  if (!latestRun) {
    return {
      run: null,
      items: [],
      total: 0,
    };
  }

  /*
   * 상위 카테고리를 선택한 경우
   * 선택 카테고리 + 활성 직계 하위 카테고리 포함
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

  /*
   * 위에서 선택한 production run의
   * GAP Score만 지도에 사용
   */
  const scores =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        runId: latestRun.id,

        place: {
          status: 'ACTIVE',

          /*
           * 지도 마커를 찍으려면
           * 좌표가 반드시 존재해야 함
           */
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
        gapPercentile: true,

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

            /*
             * 방문 인증 활성화 여부
             */
            verificationSetting: {
              select: {
                enabled: true,
              },
            },

            /*
             * 현재 영업 상태 계산용
             */
            operatingHours: {
              select: {
                dayOfWeek: true,
                isClosed: true,
                is24Hours: true,

                openTime: true,
                closeTime: true,

                breakStartTime: true,
                breakEndTime: true,
              },
            },

            /*
             * 특정 날짜 특별 운영 / 임시 휴무
             */
            specialHours: {
              select: {
                targetDate: true,
                scheduleType: true,

                openTime: true,
                closeTime: true,

                breakStartTime: true,
                breakEndTime: true,
              },
            },
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

      /*
       * 방문 인증 기능 활성화 여부
       */
      verificationAvailable:
        score.place
          .verificationSetting
          ?.enabled ?? false,

      /*
       * 현재 영업 상태
       */
      isOpenNow:
        this.calculateIsOpenNow(
          score.place.operatingHours,
          score.place.specialHours,
        ),

      operatingStatus:
        this.calculateOperatingStatus(
          score.place.operatingHours,
          score.place.specialHours,
        ),

      gapScore:
        Number(score.gapScore),

      gapPercentile:
        score.gapPercentile === null
          ? null
          : Number(
              score.gapPercentile,
            ),

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