import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  VisitVerificationsService,
} from '../visit-verifications/visit-verifications.service';

import {
  BusinessVisitVerificationQueryDto,
} from './dto/business-visit-verification-query.dto';

@Injectable()
export class BusinessVisitVerificationsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly visitVerificationsService:
      VisitVerificationsService,
  ) {}

  private async expireOldSessions(
    placeId: number,
  ) {
    await this.prisma.visitVerification
      .updateMany({
        where: {
          placeId: BigInt(placeId),

          status: 'ISSUED',

          expiresAt: {
            lt: new Date(),
          },
        },

        data: {
          status: 'EXPIRED',

          failReason:
            '인증 시간이 만료되었습니다.',
        },
      });
  }


async getSummary(
  placeId: number,
) {
  /*
   * 조회 전에 만료된 ISSUED 세션을
   * EXPIRED로 갱신
   */
  await this.expireOldSessions(
    placeId,
  );

  const now = new Date();

  /*
   * 오늘 00:00 KST
   * ~ 내일 00:00 KST
   */
  const seoulDate =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    ).format(now);

  const startOfToday =
    new Date(
      `${seoulDate}T00:00:00+09:00`,
    );

  const startOfTomorrow =
    new Date(
      startOfToday.getTime() +
        24 * 60 * 60 * 1000,
    );

  const [
    activeSessionCount,
    todayVerifiedCount,
    todayExpiredCount,
  ] = await Promise.all([
    /*
     * 현재 아직 유효한 방문 예정 세션
     */
    this.prisma.visitVerification.count({
      where: {
        placeId:
          BigInt(placeId),

        status:
          'ISSUED',

        expiresAt: {
          gte: now,
        },
      },
    }),

    /*
     * 오늘 관리자 인증 완료
     */
    this.prisma.visitVerification.count({
      where: {
        placeId:
          BigInt(placeId),

        status:
          'VERIFIED',

        verifiedAt: {
          gte:
            startOfToday,

          lt:
            startOfTomorrow,
        },
      },
    }),

    /*
     * 오늘 만료된 세션
     */
    this.prisma.visitVerification.count({
      where: {
        placeId:
          BigInt(placeId),

        status:
          'EXPIRED',

        expiresAt: {
          gte:
            startOfToday,

          lt:
            startOfTomorrow,
        },
      },
    }),
  ]);

  return {
    activeSessionCount,
    todayVerifiedCount,
    todayExpiredCount,
  };
}

async getIntakeSetting(
  placeId: number,
) {
  const setting =
    await this.prisma
      .placeVerificationSetting
      .findUnique({
        where: {
          placeId:
            BigInt(placeId),
        },

        select: {
          enabled: true,
          controlMode: true,
          hoursMode: true,
          manualAvailable: true,
          codeValidMinutes: true,
          updatedAt: true,
        },
      });

  if (!setting) {
    throw new NotFoundException(
      '방문 인증 설정을 찾을 수 없습니다.',
    );
  }

  return {
    enabled:
      setting.enabled,

    controlMode:
      setting.controlMode,

    hoursMode:
      setting.hoursMode,

    manualAvailable:
      setting.manualAvailable,

    codeValidMinutes:
      setting.codeValidMinutes,

    updatedAt:
      setting.updatedAt,
  };
}

async updateIntakeSetting(
  placeId: number,
  enabled: boolean,
  userId: number,
) {
  const existing =
    await this.prisma
      .placeVerificationSetting
      .findUnique({
        where: {
          placeId:
            BigInt(placeId),
        },

        select: {
          placeId: true,
        },
      });

  if (!existing) {
    throw new NotFoundException(
      '방문 인증 설정을 찾을 수 없습니다.',
    );
  }

  const updated =
    await this.prisma
      .placeVerificationSetting
      .update({
        where: {
          placeId:
            BigInt(placeId),
        },

        data: {
          enabled,

          updatedByUserId:
            BigInt(userId),

          updatedAt:
            new Date(),
        },

        select: {
          enabled: true,
          controlMode: true,
          hoursMode: true,
          manualAvailable: true,
          codeValidMinutes: true,
          updatedAt: true,
        },
      });

  return {
    enabled:
      updated.enabled,

    controlMode:
      updated.controlMode,

    hoursMode:
      updated.hoursMode,

    manualAvailable:
      updated.manualAvailable,

    codeValidMinutes:
      updated.codeValidMinutes,

    updatedAt:
      updated.updatedAt,

    message:
      enabled
        ? '방문 인증 접수가 시작되었습니다.'
        : '방문 인증 접수가 중지되었습니다.',
  };
}

  async findAll(
    placeId: number,
    query:
      BusinessVisitVerificationQueryDto,
  ) {
    await this.expireOldSessions(
      placeId,
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const skip =
      (page - 1) * limit;

    let createdAt:
      | {
          gte?: Date;
          lt?: Date;
        }
      | undefined;

    if (
      query.startDate ||
      query.endDate
    ) {
      createdAt = {};

      if (query.startDate) {
        createdAt.gte =
          new Date(
            `${query.startDate}T00:00:00+09:00`,
          );
      }

      if (query.endDate) {
        const end =
          new Date(
            `${query.endDate}T00:00:00+09:00`,
          );

        createdAt.lt =
          new Date(
            end.getTime() +
              24 * 60 * 60 * 1000,
          );
      }
    }

    const where = {
      placeId: BigInt(placeId),

      ...(query.status && {
        status: query.status,
      }),

      ...(query.code && {
        verificationCode: {
          contains: query.code,
        },
      }),

      ...(createdAt && {
        createdAt,
      }),
    };

    const [
      verifications,
      total,
    ] = await Promise.all([
      this.prisma.visitVerification
        .findMany({
          where,

          include: {
            user: {
              select: {
                id: true,
                realName: true,
              },
            },
          },

          orderBy: {
            createdAt: 'desc',
          },

          skip,
          take: limit,
        }),

      this.prisma.visitVerification
        .count({
          where,
        }),
    ]);

    return {
      items:
        verifications.map(
          (verification) => ({
            id: Number(
              verification.id,
            ),

            verificationCode:
              verification
                .verificationCode,

            status:
              verification.status,

            expectedArrivalAt:
              verification
                .expectedArrivalAt,

            issuedAt:
              verification.issuedAt,

            expiresAt:
              verification.expiresAt,

            verifiedAt:
              verification.verifiedAt,

            failReason:
              verification.failReason,

            user: {
              id: Number(
                verification.user.id,
              ),

              realName:
                verification.user
                  .realName,
            },
          }),
        ),

      page,
      limit,
      total,

      totalPages:
        Math.ceil(total / limit),
    };
  }

  async findById(
    placeId: number,
    id: number,
  ) {
    await this.expireOldSessions(
      placeId,
    );

    const verification =
      await this.prisma
        .visitVerification
        .findFirst({
          where: {
            id: BigInt(id),
            placeId:
              BigInt(placeId),
          },

          include: {
            user: {
              select: {
                id: true,
                realName: true,
              },
            },

            place: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

    if (!verification) {
      throw new NotFoundException(
        '방문 인증 세션을 찾을 수 없습니다.',
      );
    }

    return {
      id:
        Number(verification.id),

      verificationCode:
        verification.verificationCode,

      status:
        verification.status,

      arrivalOptionMinutes:
        verification
          .arrivalOptionMinutes,

      expectedArrivalAt:
        verification
          .expectedArrivalAt,

      issuedAt:
        verification.issuedAt,

      expiresAt:
        verification.expiresAt,

      verifiedAt:
        verification.verifiedAt,

      failReason:
        verification.failReason,

      user: {
        id:
          Number(
            verification.user.id,
          ),

        realName:
          verification.user.realName,
      },

      place: {
        id:
          Number(
            verification.place.id,
          ),

        name:
          verification.place.name,
      },
    };
  }

  async approve(
    placeId: number,
    id: number,
  ) {
    const verification =
      await this.visitVerificationsService
        .approveByBusiness(
          placeId,
          id,
        );

    if (!verification) {
      throw new NotFoundException(
        '방문 인증 세션을 찾을 수 없습니다.',
      );
    }

    return {
      verification,

      message:
        '방문 인증이 승인되었습니다.',
    };
  }

  async reject(
    placeId: number,
    id: number,
    reason: string,
  ) {
    const verification =
      await this.prisma
        .visitVerification
        .findFirst({
          where: {
            id: BigInt(id),

            placeId:
              BigInt(placeId),
          },
        });

    if (!verification) {
      throw new NotFoundException(
        '방문 인증 세션을 찾을 수 없습니다.',
      );
    }

    if (
      verification.status ===
        'ISSUED' &&
      new Date() >
        verification.expiresAt
    ) {
      await this.prisma
        .visitVerification.update({
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
        '이미 만료된 방문 인증입니다.',
      );
    }

    if (
      verification.status !==
      'ISSUED'
    ) {
      throw new BadRequestException(
        '이미 처리된 방문 인증입니다.',
      );
    }

    const result =
      await this.prisma
        .visitVerification
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
            status: 'FAILED',

            failReason:
              reason,

            verifiedAt: null,
          },
        });

    if (result.count !== 1) {
      throw new BadRequestException(
        '이미 처리된 방문 인증입니다.',
      );
    }

    const updated =
      await this.prisma
        .visitVerification
        .findUnique({
          where: {
            id:
              verification.id,
          },
        });

    return {
      verification: updated
        ? {
            id:
              Number(updated.id),

            verificationCode:
              updated
                .verificationCode,

            status:
              updated.status,

            failReason:
              updated.failReason,

            verifiedAt:
              updated.verifiedAt,
          }
        : null,

      message:
        '방문 인증이 반려되었습니다.',
    };
  }

  private verificationTimeToDate(
  value: string,
): Date {
  return new Date(
    `1970-01-01T${value}:00.000Z`,
  );
}

private verificationDateToTime(
  value: Date | null,
): string | null {
  if (!value) {
    return null;
  }

  const hours =
    String(
      value.getUTCHours(),
    ).padStart(2, '0');

  const minutes =
    String(
      value.getUTCMinutes(),
    ).padStart(2, '0');

  return `${hours}:${minutes}`;
}

async getVerificationHours(
  placeId: number,
) {
  const setting =
    await this.prisma
      .placeVerificationSetting
      .findUnique({
        where: {
          placeId:
            BigInt(placeId),
        },

        select: {
          hoursMode: true,
        },
      });

  if (!setting) {
    throw new NotFoundException(
      '방문 인증 설정을 찾을 수 없습니다.',
    );
  }

  const hours =
    await this.prisma
      .placeVerificationHour
      .findMany({
        where: {
          placeId:
            BigInt(placeId),
        },

        orderBy: {
          dayOfWeek: 'asc',
        },
      });

  return {
    hoursMode:
      setting.hoursMode,

    hours:
      hours.map(
        (hour) => ({
          dayOfWeek:
            hour.dayOfWeek,

          enabled:
            hour.enabled,

          startTime:
            this.verificationDateToTime(
              hour.startTime,
            ),

          endTime:
            this.verificationDateToTime(
              hour.endTime,
            ),
        }),
      ),
  };
}

async updateVerificationHours(
  placeId: number,
  userId: number,

  dto: {
    hoursMode:
      | 'SAME_AS_OPERATING'
      | 'CUSTOM';

    hours?: {
      dayOfWeek: number;
      enabled: boolean;
      startTime?: string;
      endTime?: string;
    }[];
  },
) {
  const setting =
    await this.prisma
      .placeVerificationSetting
      .findUnique({
        where: {
          placeId:
            BigInt(placeId),
        },

        select: {
          placeId: true,
        },
      });

  if (!setting) {
    throw new NotFoundException(
      '방문 인증 설정을 찾을 수 없습니다.',
    );
  }

  /*
   * CUSTOM일 때 전달된 요일 데이터 검증
   */
  if (
    dto.hoursMode === 'CUSTOM'
  ) {
    if (
      !dto.hours ||
      dto.hours.length === 0
    ) {
      throw new BadRequestException(
        '별도 시간 설정 시 방문 인증 가능시간을 입력해주세요.',
      );
    }

    const daySet =
      new Set<number>();

    for (
      const hour of dto.hours
    ) {
      if (
        daySet.has(
          hour.dayOfWeek,
        )
      ) {
        throw new BadRequestException(
          '같은 요일이 중복되어 있습니다.',
        );
      }

      daySet.add(
        hour.dayOfWeek,
      );

      /*
       * 사용 가능한 요일이면
       * 시작/종료 시간이 반드시 필요
       */
      if (hour.enabled) {
        if (
          !hour.startTime ||
          !hour.endTime
        ) {
          throw new BadRequestException(
            '사용 가능한 요일은 시작 시간과 종료 시간이 필요합니다.',
          );
        }

        /*
         * HH:mm 형식이라 문자열 비교 가능
         */
        if (
          hour.startTime >=
          hour.endTime
        ) {
          throw new BadRequestException(
            '종료 시간은 시작 시간보다 늦어야 합니다.',
          );
        }
      }
    }
  }

  await this.prisma.$transaction(
    async (tx) => {
      /*
       * SAME_AS_OPERATING / CUSTOM 저장
       */
      await tx
        .placeVerificationSetting
        .update({
          where: {
            placeId:
              BigInt(placeId),
          },

          data: {
            hoursMode:
              dto.hoursMode,

            updatedByUserId:
              BigInt(userId),

            updatedAt:
              new Date(),
          },
        });

      /*
       * CUSTOM 시간이 전달된 경우
       * 요일별 upsert
       *
       * SAME_AS_OPERATING으로 바꾸더라도
       * 기존 CUSTOM 값은 삭제하지 않는다.
       * 나중에 다시 CUSTOM을 선택했을 때
       * 이전 설정을 복구할 수 있기 때문이다.
       */
      if (dto.hours) {
        for (
          const hour of dto.hours
        ) {
          const startTime =
            hour.enabled &&
            hour.startTime
              ? this.verificationTimeToDate(
                  hour.startTime,
                )
              : null;

          const endTime =
            hour.enabled &&
            hour.endTime
              ? this.verificationTimeToDate(
                  hour.endTime,
                )
              : null;

          await tx
            .placeVerificationHour
            .upsert({
              where: {
                placeId_dayOfWeek:
                  {
                    placeId:
                      BigInt(
                        placeId,
                      ),

                    dayOfWeek:
                      hour.dayOfWeek,
                  },
              },

              create: {
                placeId:
                  BigInt(
                    placeId,
                  ),

                dayOfWeek:
                  hour.dayOfWeek,

                enabled:
                  hour.enabled,

                startTime,

                endTime,

                updatedAt:
                  new Date(),
              },

              update: {
                enabled:
                  hour.enabled,

                startTime,

                endTime,

                updatedAt:
                  new Date(),
              },
            });
        }
      }
    },
  );

  return this.getVerificationHours(
    placeId,
  );
}
}