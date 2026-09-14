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

  private timeToMinutes(
    value: string,
  ): number {
    const [hour, minute] =
      value
        .split(':')
        .map(Number);

    return hour * 60 + minute;
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
     * 시작과 종료가 같으면
     * 현재 API에서는 24시간 영업과 구분할 수 없으므로 허용하지 않는다.
     *
     * 자정을 넘는 영업시간
     * 예: 22:00 ~ 02:00 은 허용한다.
     */
    if (
      hour.openTime ===
      hour.closeTime
    ) {
      throw new BadRequestException(
        `${hour.dayOfWeek}요일의 영업 시작 시간과 종료 시간은 같을 수 없습니다.`,
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
      const open =
        this.timeToMinutes(
          hour.openTime,
        );

      let close =
        this.timeToMinutes(
          hour.closeTime,
        );

      let breakStart =
        this.timeToMinutes(
          hour.breakStartTime,
        );

      let breakEnd =
        this.timeToMinutes(
          hour.breakEndTime,
        );

      const crossesMidnight =
        close < open;

      /*
       * 자정을 넘는 영업시간이면
       * 종료 시각을 다음 날 기준으로 환산한다.
       */
      if (crossesMidnight) {
        close += 24 * 60;

        if (breakStart < open) {
          breakStart +=
            24 * 60;
        }

        if (breakEnd < open) {
          breakEnd +=
            24 * 60;
        }
      }

      /*
       * 휴게시간도 자정을 넘는 경우 처리한다.
       */
      if (
        breakEnd <=
        breakStart
      ) {
        breakEnd +=
          24 * 60;
      }

      /*
       * 휴게시간은 반드시
       * 영업시간 범위 안에 있어야 한다.
       */
      if (
        breakStart < open ||
        breakEnd > close
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

              /*
               * 현재 PUT API는 is24Hours를 받지 않으므로
               * 일반 영업시간 저장 시 false로 명시한다.
               */
              is24Hours: false,

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

              /*
               * 과거 24시간 영업 값이 남아
               * 일반 영업시간과 충돌하지 않도록 초기화한다.
               */
              is24Hours: false,

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
