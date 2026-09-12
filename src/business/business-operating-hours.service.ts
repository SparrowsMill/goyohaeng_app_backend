import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  BusinessOperatingHourItemDto,
  UpdateBusinessOperatingHoursDto,
} from './dto/update-business-operating-hours.dto';

@Injectable()
export class BusinessOperatingHoursService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private timeToDate(
    value: string,
  ): Date {
    return new Date(
      `1970-01-01T${value}:00.000Z`,
    );
  }

  private dateToTime(
    value: Date | null,
  ): string | null {
    if (!value) {
      return null;
    }

    const hour =
      value
        .getUTCHours()
        .toString()
        .padStart(2, '0');

    const minute =
      value
        .getUTCMinutes()
        .toString()
        .padStart(2, '0');

    return `${hour}:${minute}`;
  }

  async getOperatingHours(
    placeId: number,
  ) {
    const hours =
      await this.prisma.placeOperatingHour.findMany({
        where: {
          placeId: BigInt(placeId),
        },

        orderBy: {
          dayOfWeek: 'asc',
        },
      });

    return {
      placeId,

      hours:
        hours.map(
          (hour) => ({
            dayOfWeek:
              hour.dayOfWeek,

            isClosed:
              hour.isClosed,

            openTime:
              this.dateToTime(
                hour.openTime,
              ),

            closeTime:
              this.dateToTime(
                hour.closeTime,
              ),

            breakStartTime:
              this.dateToTime(
                hour.breakStartTime,
              ),

            breakEndTime:
              this.dateToTime(
                hour.breakEndTime,
              ),
          }),
        ),
    };
  }

  private validateHour(
    hour:
      BusinessOperatingHourItemDto,
  ) {
    /*
     * 휴무라면
     * 시간값은 사용하지 않는다.
     */
    if (hour.isClosed) {
      return;
    }

    /*
     * 영업일이면
     * 시작/종료 시간 필수
     */
    if (
      !hour.openTime ||
      !hour.closeTime
    ) {
      throw new BadRequestException(
        `${hour.dayOfWeek}요일의 영업 시작 시간과 종료 시간을 입력해주세요.`,
      );
    }

    /*
     * 현재 앱의 영업시간 계산 로직은
     * 같은 날짜 안의 영업시간을 기준으로 하므로
     * 자정을 넘는 운영시간은 우선 허용하지 않는다.
     */
    if (
      hour.openTime >=
      hour.closeTime
    ) {
      throw new BadRequestException(
        `${hour.dayOfWeek}요일의 종료 시간은 시작 시간보다 늦어야 합니다.`,
      );
    }

    const hasBreakStart =
      !!hour.breakStartTime;

    const hasBreakEnd =
      !!hour.breakEndTime;

    /*
     * 휴게시간은 시작/종료가
     * 반드시 함께 있어야 한다.
     */
    if (
      hasBreakStart !==
      hasBreakEnd
    ) {
      throw new BadRequestException(
        `${hour.dayOfWeek}요일의 휴게시간 시작/종료 시간을 모두 입력해주세요.`,
      );
    }

    if (
      hour.breakStartTime &&
      hour.breakEndTime
    ) {
      if (
        hour.breakStartTime >=
        hour.breakEndTime
      ) {
        throw new BadRequestException(
          `${hour.dayOfWeek}요일의 휴게 종료 시간은 시작 시간보다 늦어야 합니다.`,
        );
      }

      /*
       * 휴게시간은 영업시간 안에 있어야 한다.
       */
      if (
        hour.breakStartTime <
          hour.openTime ||
        hour.breakEndTime >
          hour.closeTime
      ) {
        throw new BadRequestException(
          `${hour.dayOfWeek}요일의 휴게시간은 영업시간 안에 있어야 합니다.`,
        );
      }
    }
  }

  async updateOperatingHours(
    placeId: number,
    userId: number,
    dto:
      UpdateBusinessOperatingHoursDto,
  ) {
    /*
     * 같은 요일이 요청에
     * 두 번 들어오는 것 방지
     */
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
          `${hour.dayOfWeek}요일이 중복되어 있습니다.`,
        );
      }

      daySet.add(
        hour.dayOfWeek,
      );

      this.validateHour(
        hour,
      );
    }

    const now =
      new Date();

    await this.prisma.$transaction(
      async (tx) => {
        for (
          const hour of dto.hours
        ) {
          /*
           * 휴무일이면
           * 저장되어 있던 시간도 null로 초기화
           */
          const openTime =
            hour.isClosed
              ? null
              : hour.openTime
                ? this.timeToDate(
                    hour.openTime,
                  )
                : null;

          const closeTime =
            hour.isClosed
              ? null
              : hour.closeTime
                ? this.timeToDate(
                    hour.closeTime,
                  )
                : null;

          const breakStartTime =
            hour.isClosed ||
            !hour.breakStartTime
              ? null
              : this.timeToDate(
                  hour.breakStartTime,
                );

          const breakEndTime =
            hour.isClosed ||
            !hour.breakEndTime
              ? null
              : this.timeToDate(
                  hour.breakEndTime,
                );

          await tx.placeOperatingHour.upsert({
            where: {
              placeId_dayOfWeek: {
                placeId:
                  BigInt(placeId),

                dayOfWeek:
                  hour.dayOfWeek,
              },
            },

            create: {
              placeId:
                BigInt(placeId),

              dayOfWeek:
                hour.dayOfWeek,

              isClosed:
                hour.isClosed,

              openTime,
              closeTime,

              breakStartTime,
              breakEndTime,

              updatedByUserId:
                BigInt(userId),

              updatedAt:
                now,
            },

            update: {
              isClosed:
                hour.isClosed,

              openTime,
              closeTime,

              breakStartTime,
              breakEndTime,

              updatedByUserId:
                BigInt(userId),

              updatedAt:
                now,
            },
          });
        }
      },
    );

    return this.getOperatingHours(
      placeId,
    );
  }
}