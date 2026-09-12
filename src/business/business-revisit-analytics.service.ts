import {
  Injectable,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service';

@Injectable()
export class BusinessRevisitAnalyticsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async getRevisitAnalytics(
    placeId: number,
  ) {
    const visitorGroups =
      await this.prisma
        .visitVerification
        .groupBy({
          by: [
            'userId',
          ],

          where: {
            placeId:
              BigInt(placeId),

            status:
              'VERIFIED',
          },

          _count: {
            _all: true,
          },
        });

    const totalUniqueVisitors =
      visitorGroups.length;

    const returningVisitorCount =
      visitorGroups.filter(
        (visitor) =>
          visitor._count._all >= 2,
      ).length;

    const firstTimeVisitorCount =
      visitorGroups.filter(
        (visitor) =>
          visitor._count._all === 1,
      ).length;

    const totalVerifiedVisits =
      visitorGroups.reduce(
        (
          sum,
          visitor,
        ) =>
          sum +
          visitor._count._all,
        0,
      );

    /*
     * 예:
     *
     * A 3회 방문
     * → 최초 1회 제외
     * → 재방문 2회
     *
     * B 2회 방문
     * → 재방문 1회
     */
    const revisitVisitCount =
      visitorGroups.reduce(
        (
          sum,
          visitor,
        ) =>
          sum +
          Math.max(
            visitor._count._all -
              1,
            0,
          ),
        0,
      );

    const revisitRate =
      totalUniqueVisitors === 0
        ? 0
        : Number(
            (
              (
                returningVisitorCount /
                totalUniqueVisitors
              ) *
              100
            ).toFixed(2),
          );

    const revisitVisitRate =
      totalVerifiedVisits === 0
        ? 0
        : Number(
            (
              (
                revisitVisitCount /
                totalVerifiedVisits
              ) *
              100
            ).toFixed(2),
          );

    /*
     * 방문 횟수별 사용자 분포
     */
    let oneVisitCount = 0;
    let twoVisitCount = 0;
    let threeOrMoreVisitCount =
      0;

    for (
      const visitor
      of visitorGroups
    ) {
      const count =
        visitor._count._all;

      if (count === 1) {
        oneVisitCount++;
      } else if (
        count === 2
      ) {
        twoVisitCount++;
      } else {
        threeOrMoreVisitCount++;
      }
    }

    return {
      placeId,

      totalUniqueVisitors,

      firstTimeVisitorCount,

      returningVisitorCount,

      revisitRate,

      totalVerifiedVisits,

      revisitVisitCount,

      revisitVisitRate,

      visitFrequency: {
        oneVisit:
          oneVisitCount,

        twoVisits:
          twoVisitCount,

        threeOrMoreVisits:
          threeOrMoreVisitCount,
      },
    };
  }

  async getVerificationFunnel(
  placeId: number,
) {
  const now = new Date();

  const placeIdBigInt =
    BigInt(placeId);

  const [
    totalRequestedCount,
    pendingCount,
    verifiedCount,
    rejectedCount,
    cancelledCount,
    expiredStoredCount,
    expiredIssuedCount,
  ] =
    await Promise.all([
      /*
       * 전체 방문 인증 신청
       */
      this.prisma
        .visitVerification
        .count({
          where: {
            placeId:
              placeIdBigInt,
          },
        }),

      /*
       * 아직 유효한 대기 상태
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
       * 승인 완료
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
       * 관리자 반려
       *
       * 현재 프로젝트에서는
       * 반려 = FAILED
       */
      this.prisma
        .visitVerification
        .count({
          where: {
            placeId:
              placeIdBigInt,

            status:
              'FAILED',
          },
        }),

      /*
       * 사용자 취소
       */
      this.prisma
        .visitVerification
        .count({
          where: {
            placeId:
              placeIdBigInt,

            status:
              'CANCELLED',
          },
        }),

      /*
       * DB에 이미 EXPIRED로
       * 저장된 인증
       */
      this.prisma
        .visitVerification
        .count({
          where: {
            placeId:
              placeIdBigInt,

            status:
              'EXPIRED',
          },
        }),

      /*
       * DB 상태는 ISSUED지만
       * 실제 만료시간이 지난 인증
       *
       * lazy expiration 때문에
       * 따로 포함한다.
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
              lte: now,
            },
          },
        }),
    ]);

  const expiredCount =
    expiredStoredCount +
    expiredIssuedCount;

  const resolvedCount =
    verifiedCount +
    rejectedCount +
    cancelledCount +
    expiredCount;

  const rate = (
    count: number,
    denominator: number,
  ) => {
    if (denominator === 0) {
      return 0;
    }

    return Number(
      (
        (
          count /
          denominator
        ) *
        100
      ).toFixed(2),
    );
  };

  return {
    placeId,

    totalRequestedCount,

    funnel: {
      pending: {
        count:
          pendingCount,

        rate:
          rate(
            pendingCount,
            totalRequestedCount,
          ),
      },

      verified: {
        count:
          verifiedCount,

        rate:
          rate(
            verifiedCount,
            totalRequestedCount,
          ),
      },

      rejected: {
        count:
          rejectedCount,

        rate:
          rate(
            rejectedCount,
            totalRequestedCount,
          ),
      },

      cancelled: {
        count:
          cancelledCount,

        rate:
          rate(
            cancelledCount,
            totalRequestedCount,
          ),
      },

      expired: {
        count:
          expiredCount,

        rate:
          rate(
            expiredCount,
            totalRequestedCount,
          ),
      },
    },

    resolvedCount,

    /*
     * 전체 신청 대비
     * 실제 인증 완료 비율
     */
    verificationRate:
      rate(
        verifiedCount,
        totalRequestedCount,
      ),

    /*
     * 이미 결과가 난 건들 중
     * 승인된 비율
     *
     * 대기 중인 건은 제외
     */
    approvalRateAmongResolved:
      rate(
        verifiedCount,
        resolvedCount,
      ),
  };
}
}