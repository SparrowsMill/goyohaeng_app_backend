import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  UpdateBusinessSpecialHourDto,
} from './dto/update-business-special-hour.dto';

import {
  CreateBusinessTemporaryClosureDto,
} from './dto/create-business-temporary-closure.dto';

@Injectable()
export class BusinessSpecialHoursService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private dateStringToDate(
    value: string,
  ): Date {
    const date =
      new Date(
        `${value}T00:00:00.000Z`,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new BadRequestException(
        '잘못된 날짜입니다.',
      );
    }

    return date;
  }

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

  /*
   * HH:mm 문자열을 분 단위로 변환
   *
   * 예:
   * 22:30 -> 1350
   * 02:00 -> 120
   */
  private timeToMinutes(
    value: string,
  ): number {
    const [hour, minute] =
      value
        .split(':')
        .map(Number);

    return (
      hour * 60 +
      minute
    );
  }

  async getSpecialHours(
    placeId: number,
  ) {
    const rows =
      await this.prisma
        .placeSpecialHour
        .findMany({
          where: {
            placeId:
              BigInt(placeId),
          },

          orderBy: {
            targetDate:
              'asc',
          },
        });

    return {
      placeId,

      specialHours:
        rows.map(
          (row) => ({
            id:
              Number(row.id),

            targetDate:
              this.formatDate(
                row.targetDate,
              ),

            scheduleType:
              row.scheduleType,

            openTime:
              this.dateToTime(
                row.openTime,
              ),

            closeTime:
              this.dateToTime(
                row.closeTime,
              ),

            breakStartTime:
              this.dateToTime(
                row.breakStartTime,
              ),

            breakEndTime:
              this.dateToTime(
                row.breakEndTime,
              ),

            reason:
              row.reason,
          }),
        ),
    };
  }

  private formatDate(
    value: Date,
  ): string {
    return value
      .toISOString()
      .slice(0, 10);
  }

  async updateSpecialHour(
    placeId: number,
    userId: number,
    dto:
      UpdateBusinessSpecialHourDto,
  ) {
    /*
     * =========================================================
     * 완전 휴무
     * =========================================================
     */
    if (
      dto.scheduleType ===
      'CLOSED'
    ) {
      await this.prisma
        .placeSpecialHour
        .upsert({
          where: {
            placeId_targetDate: {
              placeId:
                BigInt(placeId),

              targetDate:
                this.dateStringToDate(
                  dto.targetDate,
                ),
            },
          },

          create: {
            placeId:
              BigInt(placeId),

            targetDate:
              this.dateStringToDate(
                dto.targetDate,
              ),

            scheduleType:
              'CLOSED',

            openTime: null,
            closeTime: null,

            breakStartTime:
              null,

            breakEndTime:
              null,

            reason:
              dto.reason?.trim() ||
              null,

            updatedByUserId:
              BigInt(userId),
          },

          update: {
            scheduleType:
              'CLOSED',

            openTime: null,
            closeTime: null,

            breakStartTime:
              null,

            breakEndTime:
              null,

            reason:
              dto.reason?.trim() ||
              null,

            updatedByUserId:
              BigInt(userId),
          },
        });

      return this.getSpecialHours(
        placeId,
      );
    }

    /*
     * =========================================================
     * 특별 운영
     * =========================================================
     */

    /*
     * 특별 운영일은
     * 시작/종료 시간이 모두 필요함
     */
    if (
      !dto.openTime ||
      !dto.closeTime
    ) {
      throw new BadRequestException(
        '특별 운영일은 시작 시간과 종료 시간이 필요합니다.',
      );
    }

    /*
     * 시작 == 종료는 허용하지 않는다.
     *
     * 단,
     * 22:00 ~ 02:00처럼
     * 자정을 넘는 운영시간은 허용한다.
     */
    if (
      dto.openTime ===
      dto.closeTime
    ) {
      throw new BadRequestException(
        '특별 운영 시작 시간과 종료 시간은 같을 수 없습니다.',
      );
    }

    const hasBreakStart =
      !!dto.breakStartTime;

    const hasBreakEnd =
      !!dto.breakEndTime;

    /*
     * 휴게시간은
     * 시작/종료가 반드시 함께 있어야 함
     */
    if (
      hasBreakStart !==
      hasBreakEnd
    ) {
      throw new BadRequestException(
        '휴게시간 시작과 종료를 모두 입력해주세요.',
      );
    }

    /*
     * =========================================================
     * 휴게시간 검증
     * =========================================================
     *
     * 일반 운영:
     * 09:00 ~ 18:00
     * break 15:00 ~ 16:00
     *
     * 자정 넘는 운영:
     * 22:00 ~ 02:00
     * break 23:30 ~ 00:30
     */
    if (
      dto.breakStartTime &&
      dto.breakEndTime
    ) {
      const open =
        this.timeToMinutes(
          dto.openTime,
        );

      let close =
        this.timeToMinutes(
          dto.closeTime,
        );

      let breakStart =
        this.timeToMinutes(
          dto.breakStartTime,
        );

      let breakEnd =
        this.timeToMinutes(
          dto.breakEndTime,
        );

      /*
       * close < open이면
       * 다음 날까지 영업하는 것으로 판단
       *
       * 예:
       * 22:00 ~ 02:00
       *
       * 1320 ~ 120
       * ↓
       * 1320 ~ 1560
       */
      const crossesMidnight =
        close < open;

      if (crossesMidnight) {
        close +=
          24 * 60;

        /*
         * 자정 이후의 휴게시간은
         * 다음 날 시간으로 변환
         *
         * 00:30 -> 1470
         */
        if (
          breakStart <
          open
        ) {
          breakStart +=
            24 * 60;
        }

        if (
          breakEnd <
          open
        ) {
          breakEnd +=
            24 * 60;
        }
      }

      /*
       * 휴게시간 자체가 자정을 넘는 경우
       *
       * 예:
       * 23:30 ~ 00:30
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
       * 특별 운영시간 안에 있어야 함
       */
      if (
        breakStart < open ||
        breakEnd > close
      ) {
        throw new BadRequestException(
          '휴게시간은 운영시간 안에 있어야 합니다.',
        );
      }
    }

    const targetDate =
      this.dateStringToDate(
        dto.targetDate,
      );

    await this.prisma
      .placeSpecialHour
      .upsert({
        where: {
          placeId_targetDate: {
            placeId:
              BigInt(placeId),

            targetDate,
          },
        },

        create: {
          placeId:
            BigInt(placeId),

          targetDate,

          scheduleType:
            'SPECIAL_OPEN',

          openTime:
            this.timeToDate(
              dto.openTime,
            ),

          closeTime:
            this.timeToDate(
              dto.closeTime,
            ),

          breakStartTime:
            dto.breakStartTime
              ? this.timeToDate(
                  dto.breakStartTime,
                )
              : null,

          breakEndTime:
            dto.breakEndTime
              ? this.timeToDate(
                  dto.breakEndTime,
                )
              : null,

          reason:
            dto.reason?.trim() ||
            null,

          updatedByUserId:
            BigInt(userId),
        },

        update: {
          scheduleType:
            'SPECIAL_OPEN',

          openTime:
            this.timeToDate(
              dto.openTime,
            ),

          closeTime:
            this.timeToDate(
              dto.closeTime,
            ),

          breakStartTime:
            dto.breakStartTime
              ? this.timeToDate(
                  dto.breakStartTime,
                )
              : null,

          breakEndTime:
            dto.breakEndTime
              ? this.timeToDate(
                  dto.breakEndTime,
                )
              : null,

          reason:
            dto.reason?.trim() ||
            null,

          updatedByUserId:
            BigInt(userId),
        },
      });

    return this.getSpecialHours(
      placeId,
    );
  }

  async deleteSpecialHour(
    placeId: number,
    date: string,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date,
      )
    ) {
      throw new BadRequestException(
        '날짜 형식은 YYYY-MM-DD여야 합니다.',
      );
    }

    const result =
      await this.prisma
        .placeSpecialHour
        .deleteMany({
          where: {
            placeId:
              BigInt(placeId),

            targetDate:
              this.dateStringToDate(
                date,
              ),
          },
        });

    if (
      result.count === 0
    ) {
      throw new NotFoundException(
        '특별 운영 일정을 찾을 수 없습니다.',
      );
    }

    return {
      targetDate:
        date,

      deleted: true,
    };
  }

  async createTemporaryClosure(
    placeId: number,
    userId: number,
    dto:
      CreateBusinessTemporaryClosureDto,
  ) {
    const start =
      this.dateStringToDate(
        dto.startDate,
      );

    const end =
      this.dateStringToDate(
        dto.endDate,
      );

    if (
      start.getTime() >
      end.getTime()
    ) {
      throw new BadRequestException(
        '종료일은 시작일보다 빠를 수 없습니다.',
      );
    }

    const oneDay =
      24 *
      60 *
      60 *
      1000;

    const numberOfDays =
      Math.floor(
        (
          end.getTime() -
          start.getTime()
        ) /
          oneDay,
      ) + 1;

    /*
     * 실수로 너무 큰 기간을 넣는 것 방지
     */
    if (
      numberOfDays >
      366
    ) {
      throw new BadRequestException(
        '임시휴무 기간은 최대 366일까지 설정할 수 있습니다.',
      );
    }

    const reason =
      dto.reason?.trim() ||
      null;

    await this.prisma.$transaction(
      async (tx) => {
        for (
          let i = 0;
          i < numberOfDays;
          i++
        ) {
          const targetDate =
            new Date(
              start.getTime() +
                i * oneDay,
            );

          await tx
            .placeSpecialHour
            .upsert({
              where: {
                placeId_targetDate: {
                  placeId:
                    BigInt(
                      placeId,
                    ),

                  targetDate,
                },
              },

              create: {
                placeId:
                  BigInt(
                    placeId,
                  ),

                targetDate,

                scheduleType:
                  'CLOSED',

                openTime:
                  null,

                closeTime:
                  null,

                breakStartTime:
                  null,

                breakEndTime:
                  null,

                reason,

                updatedByUserId:
                  BigInt(userId),
              },

              update: {
                scheduleType:
                  'CLOSED',

                openTime:
                  null,

                closeTime:
                  null,

                breakStartTime:
                  null,

                breakEndTime:
                  null,

                reason,

                updatedByUserId:
                  BigInt(userId),
              },
            });
        }
      },
    );

    return {
      startDate:
        dto.startDate,

      endDate:
        dto.endDate,

      closedDays:
        numberOfDays,

      reason,
    };
  }
}