import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service';

@Injectable()
export class BusinessDashboardService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  private formatKstDate(
    date: Date,
  ): string {
    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        },
      ).formatToParts(date);

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
  }

  private addDays(
    dateString: string,
    days: number,
  ): string {
    const [
      year,
      month,
      day,
    ] =
      dateString
        .split('-')
        .map(Number);

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day + days,
        ),
      );

    const nextYear =
      date.getUTCFullYear();

    const nextMonth =
      String(
        date.getUTCMonth() + 1,
      ).padStart(2, '0');

    const nextDay =
      String(
        date.getUTCDate(),
      ).padStart(2, '0');

    return (
      `${nextYear}-` +
      `${nextMonth}-` +
      `${nextDay}`
    );
  }

  private kstStart(
    dateString: string,
  ): Date {
    return new Date(
      `${dateString}T00:00:00+09:00`,
    );
  }

  async getDashboard(
    placeId: number,
  ) {
    const now =
      new Date();

    const today =
      this.formatKstDate(now);

    const tomorrow =
      this.addDays(
        today,
        1,
      );

    const sevenDaysAgo =
      this.addDays(
        today,
        -6,
      );

    const todayStart =
      this.kstStart(
        today,
      );

    const tomorrowStart =
      this.kstStart(
        tomorrow,
      );

    const sevenDaysStart =
      this.kstStart(
        sevenDaysAgo,
      );

    const placeIdBigInt =
      BigInt(placeId);

    const [
      pendingCount,
      todayIssuedCount,
      todayVerifiedCount,
      totalVerifiedCount,
      last7DaysVerified,
      recentVerifications,
    ] =
      await Promise.all([
        /*
         * 현재 승인 대기
         *
         * 만료되지 않은 ISSUED만
         * 실제 대기로 계산한다.
         */
        this.prisma
          .visitVerification
          .count({
            where: {
              placeId:
                placeIdBigInt,

              status:
                'ISSUED',

              expiresAt: {
                gt: now,
              },
            },
          }),

        /*
         * 오늘 신청된 방문 인증 수
         * 한국 시간 기준
         */
        this.prisma
          .visitVerification
          .count({
            where: {
              placeId:
                placeIdBigInt,

              issuedAt: {
                gte:
                  todayStart,

                lt:
                  tomorrowStart,
              },
            },
          }),

        /*
         * 오늘 승인 완료된 인증 수
         */
        this.prisma
          .visitVerification
          .count({
            where: {
              placeId:
                placeIdBigInt,

              status:
                'VERIFIED',

              verifiedAt: {
                gte:
                  todayStart,

                lt:
                  tomorrowStart,
              },
            },
          }),

        /*
         * 누적 승인 완료
         */
        this.prisma
          .visitVerification
          .count({
            where: {
              placeId:
                placeIdBigInt,

              status:
                'VERIFIED',
            },
          }),

        /*
         * 최근 7일 승인 데이터
         * 일자별 그래프 계산용
         */
        this.prisma
          .visitVerification
          .findMany({
            where: {
              placeId:
                placeIdBigInt,

              status:
                'VERIFIED',

              verifiedAt: {
                gte:
                  sevenDaysStart,

                lt:
                  tomorrowStart,
              },
            },

            select: {
              verifiedAt: true,
            },

            orderBy: {
              verifiedAt:
                'asc',
            },
          }),

        /*
         * 최근 방문 인증 5개
         */
        this.prisma
          .visitVerification
          .findMany({
            where: {
              placeId:
                placeIdBigInt,
            },

            orderBy: {
              createdAt:
                'desc',
            },

            take: 5,

            select: {
              id: true,

              userId: true,

              verificationCode:
                true,

              expectedArrivalAt:
                true,

              issuedAt: true,

              expiresAt: true,

              status: true,

              verifiedAt: true,

              failReason: true,

              user: {
                select: {
                  username:
                    true,

                  realName:
                    true,
                },
              },
            },
          }),
      ]);

    /*
     * 7일 그래프 기본값
     *
     * 인증이 0건인 날짜도
     * 응답에 포함시킨다.
     */
    const dailyMap =
      new Map<string, number>();

    for (
      let i = 0;
      i < 7;
      i++
    ) {
      const date =
        this.addDays(
          sevenDaysAgo,
          i,
        );

      dailyMap.set(
        date,
        0,
      );
    }

    for (
      const verification
      of last7DaysVerified
    ) {
      if (
        !verification
          .verifiedAt
      ) {
        continue;
      }

      const date =
        this.formatKstDate(
          verification
            .verifiedAt,
        );

      dailyMap.set(
        date,
        (
          dailyMap.get(
            date,
          ) ?? 0
        ) + 1,
      );
    }

    const dailyVerifiedCounts =
      Array.from(
        dailyMap.entries(),
      ).map(
        ([
          date,
          count,
        ]) => ({
          date,
          count,
        }),
      );

    return {
      placeId,

      summary: {
        pendingCount,

        todayIssuedCount,

        todayVerifiedCount,

        last7DaysVerifiedCount:
          last7DaysVerified.length,

        totalVerifiedCount,
      },

      dailyVerifiedCounts,

      recentVerifications:
        recentVerifications.map(
          (
            verification,
          ) => {
            /*
             * DB 상태가 아직 ISSUED더라도
             * 이미 시간이 지났다면
             * 화면에서는 EXPIRED로 보여준다.
             */
            const status =
              verification.status ===
                'ISSUED' &&
              verification.expiresAt
                .getTime() <=
                now.getTime()
                ? 'EXPIRED'
                : verification.status;

            return {
              id:
                Number(
                  verification.id,
                ),

              userId:
                Number(
                  verification.userId,
                ),

              username:
                verification.user
                  .username,

              realName:
                verification.user
                  .realName,

              verificationCode:
                verification
                  .verificationCode,

              status,

              expectedArrivalAt:
                verification
                  .expectedArrivalAt,

              issuedAt:
                verification
                  .issuedAt,

              expiresAt:
                verification
                  .expiresAt,

              verifiedAt:
                verification
                  .verifiedAt,

              failReason:
                verification
                  .failReason,
            };
          },
        ),
    };
  }
}