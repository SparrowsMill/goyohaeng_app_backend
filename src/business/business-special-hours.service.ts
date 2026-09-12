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

  private formatDate(
    value: Date,
  ): string {
    return value
      .toISOString()
      .slice(0, 10);
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

  async updateSpecialHour(
    placeId: number,
    userId: number,
    dto:
      UpdateBusinessSpecialHourDto,
  ) {
    /*
     * 완전 휴무
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
     * 특별 운영
     */
    if (
      !dto.openTime ||
      !dto.closeTime
    ) {
      throw new BadRequestException(
        '특별 운영일은 시작 시간과 종료 시간이 필요합니다.',
      );
    }

    if (
      dto.openTime >=
      dto.closeTime
    ) {
      throw new BadRequestException(
        '종료 시간은 시작 시간보다 늦어야 합니다.',
      );
    }

    const hasBreakStart =
      !!dto.breakStartTime;

    const hasBreakEnd =
      !!dto.breakEndTime;

    if (
      hasBreakStart !==
      hasBreakEnd
    ) {
      throw new BadRequestException(
        '휴게시간 시작과 종료를 모두 입력해주세요.',
      );
    }

    if (
      dto.breakStartTime &&
      dto.breakEndTime
    ) {
      if (
        dto.breakStartTime >=
        dto.breakEndTime
      ) {
        throw new BadRequestException(
          '휴게 종료 시간은 시작 시간보다 늦어야 합니다.',
        );
      }

      if (
        dto.breakStartTime <
          dto.openTime ||
        dto.breakEndTime >
          dto.closeTime
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