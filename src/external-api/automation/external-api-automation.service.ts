import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';

import { RegionVisitorService } from '../region-visitor/region-visitor.service';
import { TourismResourceDemandService } from '../tourism-resource-demand/tourism-resource-demand.service';
import { TourismDemandStrengthService } from '../tourism-demand-strength/tourism-demand-strength.service';

import { GapDataPeriodService } from './gap-data-period.service';
import { NaverService } from '../naver/naver.service';
import { GapScoreCalculationService } from './gap-score-calculation.service';
import { TourService } from '../tour/tour.service';
import { NaverBlogService } from '../naver-blog/naver-blog.service';

@Injectable()
export class ExternalApiAutomationService {
    private readonly logger =
    new Logger(
      ExternalApiAutomationService.name,
    );

  private gapRegionalSyncRunning =
    false;

  private tourIncrementalSyncRunning =
    false;

  private naverBlogSyncRunning =
    false;

  constructor(
    private readonly prisma: PrismaService,

    private readonly regionVisitorService: RegionVisitorService,
    private readonly resourceDemandService: TourismResourceDemandService,
    private readonly demandStrengthService: TourismDemandStrengthService,

    private readonly gapDataPeriodService: GapDataPeriodService,
    private readonly naverService: NaverService,
    private readonly gapScoreCalculationService: GapScoreCalculationService,

    private readonly tourService: TourService,
    private readonly naverBlogService: NaverBlogService,
  ) {}

  async runGapScoreCalculation(
    baseYm: string,
  ) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(
        `invalid GAP month: ${baseYm}`,
      );
    }

    const regionalReady =
      await this.isGapRegionalMonthAlreadySynced(
        baseYm,
      );

    if (!regionalReady) {
      throw new Error(
        `GAP regional sync is not complete: ${baseYm}`,
      );
    }

    const naverReady =
      await this.isGapNaverMonthAlreadySynced(
        baseYm,
      );

    if (!naverReady) {
      throw new Error(
        `GAP Naver sync is not complete: ${baseYm}`,
      );
    }

    const result =
      await this.gapScoreCalculationService
        .calculateAndStoreGapScores(
          baseYm,
        );

    this.logger.log(
      result.skipped
        ? `GAP score already calculated: ${baseYm}, ` +
          `run=${result.runId.toString()}, ` +
          `scores=${result.scoreCount}`
        : `GAP score calculated: ${baseYm}, ` +
          `run=${result.runId.toString()}, ` +
          `scores=${result.scoreCount}`,
    );

    return result;
  }

  private async isGapRegionalMonthAlreadySynced(
    baseYm: string,
  ): Promise<boolean> {
    const visitorSource =
      await this.getSource(
        'REGION_VISITOR_API',
      );

    const resourceSource =
      await this.getSource(
        'TOURISM_RESOURCE_DEMAND_API',
      );

    const strengthSource =
      await this.getSource(
        'TOURISM_DEMAND_STRENGTH_API',
      );

    const endpoint =
      `month:${baseYm}`;

    const [
      visitorSuccess,
      resourceSuccess,
      strengthSuccess,
    ] = await Promise.all([
      this.prisma.externalSyncRun.count({
        where: {
          sourceId:
            visitorSource.id,
          endpoint,
          syncType:
            'PERIODIC',
          status:
            'SUCCESS',
        },
      }),

      this.prisma.externalSyncRun.count({
        where: {
          sourceId:
            resourceSource.id,
          endpoint,
          syncType:
            'PERIODIC',
          status:
            'SUCCESS',
        },
      }),

      this.prisma.externalSyncRun.count({
        where: {
          sourceId:
            strengthSource.id,
          endpoint,
          syncType:
            'PERIODIC',
          status:
            'SUCCESS',
        },
      }),
    ]);

    return (
      visitorSuccess > 0 &&
      resourceSuccess > 0 &&
      strengthSuccess > 0
    );
  }

  private async isGapNaverMonthAlreadySynced(
    baseYm: string,
  ): Promise<boolean> {
    const source =
      await this.getSource(
        'NAVER_DATALAB',
      );

    const count =
      await this.prisma.externalSyncRun.count({
        where: {
          sourceId:
            source.id,

          endpoint:
            `month:${baseYm}`,

          syncType:
            'PERIODIC',

          status:
            'SUCCESS',
        },
      });

    return count > 0;
  }

  private getMonthDateRange(
    baseYm: string,
  ) {
    const year =
      Number(baseYm.slice(0, 4));

    const month =
      Number(baseYm.slice(4, 6));

    const dayCount =
      new Date(
        Date.UTC(year, month, 0),
      ).getUTCDate();

    const startDate =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1,
        ),
      );

    const endDate =
      new Date(
        Date.UTC(
          year,
          month - 1,
          dayCount,
        ),
      );

    return {
      dayCount,
      startDate,
      endDate,
    };
  }

  private async getSource(
    code: string,
  ) {
    const source =
      await this.prisma.externalSource.findUnique({
        where: {
          code,
        },
      });

    if (!source) {
      throw new Error(
        `external source not found: ${code}`,
      );
    }

    return source;
  }

  private async startRun(
    sourceId: bigint,
    endpoint: string,
  ) {
    return this.prisma.externalSyncRun.create({
      data: {
        sourceId,
        endpoint,
        syncType: 'PERIODIC',
        status: 'RUNNING',
      },
    });
  }

  private async completeRun(
    runId: bigint,
    resultCount: number,
  ) {
    await this.prisma.externalSyncRun.update({
      where: {
        id: runId,
      },
      data: {
        status: 'SUCCESS',
        finishedAt: new Date(),
        resultCount,
        errorMessage: null,
      },
    });
  }

  private async failRun(
    runId: bigint,
    error: unknown,
  ) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await this.prisma.externalSyncRun.update({
      where: {
        id: runId,
      },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage:
          message.slice(0, 5000),
      },
    });
  }



  /**
   * GAP에 필요한 지역 기반 외부데이터 전체 동기화.
   *
   * 반드시 세 source를 같은 YYYYMM으로 맞춘다.
   *
   * 세 source의 sync + 최종 validation이 모두 성공해야만
   * external_sync_runs를 SUCCESS 처리한다.
   */
  async runGapRegionalSync(
    preResolvedPeriod?: {
      commonMonth: string;
      latestVisitorMonth: string;
      latestResourceMonth: string;
      latestStrengthMonth: string;
    },
  ) {
    const period =
      preResolvedPeriod ??
      await this.gapDataPeriodService.findLatestCommonMonth();

    const baseYm =
      period.commonMonth;

    console.log(
      `[ExternalApiAutomation] GAP common month = ${baseYm}`,
    );

    const visitorSource =
      await this.getSource(
        'REGION_VISITOR_API',
      );

    const resourceSource =
      await this.getSource(
        'TOURISM_RESOURCE_DEMAND_API',
      );

    const strengthSource =
      await this.getSource(
        'TOURISM_DEMAND_STRENGTH_API',
      );

    /*
     * 실행 이력은 transaction 밖.
     * 실패해도 FAILED 기록은 남아야 한다.
     */
    const visitorRun =
      await this.startRun(
        visitorSource.id,
        `month:${baseYm}`,
      );

    const resourceRun =
      await this.startRun(
        resourceSource.id,
        `month:${baseYm}`,
      );

    const strengthRun =
      await this.startRun(
        strengthSource.id,
        `month:${baseYm}`,
      );

    try {
      /*
       * 2. API 수집 + 메모리 변환.
       *
       * 여기까지는 RAW / region_metrics 변경 없음.
       */
      const {
        startYmd,
        endYmd,
      } =
        this.getMonthYmdRange(
          baseYm,
        );

      const visitorPrepared =
        await this.regionVisitorService.prepareSeoulVisitorData(
          startYmd,
          endYmd,
        );

      const resourcePrepared =
        await this.resourceDemandService.prepareSeoulDemand(
          baseYm,
        );

      const strengthPrepared =
        await this.demandStrengthService.prepareSeoulStrength(
          baseYm,
        );

      /*
       * 3. DB를 건드리기 전에 메모리 상태 검증.
       */
      const dayCount =
        this.getMonthDateRange(
          baseYm,
        ).dayCount;

      const expectedVisitor =
        26 * dayCount * 3;

      const expectedResource =
        25 * 19;

      const expectedStrength =
        25 * 10;

      if (
        visitorPrepared.metricRows.length !==
        expectedVisitor
      ) {
        throw new Error(
          `Prepared REGION_VISITOR validation failed: ` +
            `${visitorPrepared.metricRows.length}/${expectedVisitor}`,
        );
      }

      if (
        resourcePrepared.metricRows.length !==
        expectedResource
      ) {
        throw new Error(
          `Prepared RESOURCE_DEMAND validation failed: ` +
            `${resourcePrepared.metricRows.length}/${expectedResource}`,
        );
      }

      if (
        strengthPrepared.metricRows.length !==
        expectedStrength
      ) {
        throw new Error(
          `Prepared DEMAND_STRENGTH validation failed: ` +
            `${strengthPrepared.metricRows.length}/${expectedStrength}`,
        );
      }

      /*
       * 4. 세 source의 실제 DB 변경을 단 하나의 transaction으로 수행.
       *
       * 하나라도 INSERT / DELETE / validation 실패 시
       * 세 source 전체 ROLLBACK.
       */
      const validation =
        await this.prisma.$transaction(
          async (tx) => {
            await this.regionVisitorService.applyPreparedSeoulVisitorData(
              visitorPrepared,
              tx,
            );

            await this.resourceDemandService.applyPreparedSeoulDemand(
              resourcePrepared,
              tx,
            );

            await this.demandStrengthService.applyPreparedSeoulStrength(
              strengthPrepared,
              tx,
            );

            return this.validateRegionMetricsWithTx(
              baseYm,
              tx,
            );
          },
          {
            maxWait: 10_000,
            timeout: 30_000,
          },
        );

      /*
       * transaction COMMIT 이후에만 SUCCESS.
       */
      await Promise.all([
        this.completeRun(
          visitorRun.id,
          visitorPrepared.metricRows.length,
        ),

        this.completeRun(
          resourceRun.id,
          resourcePrepared.metricRows.length,
        ),

        this.completeRun(
          strengthRun.id,
          strengthPrepared.metricRows.length,
        ),
      ]);

      return {
        ...period,

        results: {
          visitor:
            visitorPrepared.result,

          resourceDemand:
            resourcePrepared.result,

          demandStrength:
            strengthPrepared.result,
        },

        validation,
      };
    } catch (error) {
      /*
       * API 수집 실패든,
       * 사전검증 실패든,
       * transaction rollback이든
       * run 기록은 FAILED.
       */
      await Promise.allSettled([
        this.failRun(
          visitorRun.id,
          error,
        ),

        this.failRun(
          resourceRun.id,
          error,
        ),

        this.failRun(
          strengthRun.id,
          error,
        ),
      ]);

      throw error;
    }
  }

    private getMonthYmdRange(
    baseYm: string,
  ) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(
        `Invalid baseYm: ${baseYm}`,
      );
    }

    const year =
      Number(
        baseYm.slice(0, 4),
      );

    const month =
      Number(
        baseYm.slice(4, 6),
      );

    const lastDay =
      new Date(
        Date.UTC(
          year,
          month,
          0,
        ),
      ).getUTCDate();

    return {
      startYmd:
        `${baseYm}01`,

      endYmd:
        `${baseYm}${String(
          lastDay,
        ).padStart(2, '0')}`,
    };
  }

  private async validateRegionMetricsWithTx(
    baseYm: string,
    tx: any,
  ) {
    const {
      dayCount,
      startDate,
      endDate,
    } =
      this.getMonthDateRange(
        baseYm,
      );

    const visitorSource =
      await this.getSource(
        'REGION_VISITOR_API',
      );

    const resourceSource =
      await this.getSource(
        'TOURISM_RESOURCE_DEMAND_API',
      );

    const strengthSource =
      await this.getSource(
        'TOURISM_DEMAND_STRENGTH_API',
      );

    /*
     * Visitor는 광역 1 + 자치구 25까지
     * normalized table 전체가 정확해야 한다.
     */
    const visitorRows =
      await tx.regionMetric.count({
        where: {
          sourceId:
            visitorSource.id,

          metricFamily:
            'VISITOR',

          metricCode:
            'TOU_NUM',

          periodDate: {
            gte:
              startDate,

            lte:
              endDate,
          },
        },
      });

    const resourceRows =
      await tx.regionMetric.count({
        where: {
          sourceId:
            resourceSource.id,

          periodMonth:
            baseYm,
        },
      });

    const strengthRows =
      await tx.regionMetric.count({
        where: {
          sourceId:
            strengthSource.id,

          periodMonth:
            baseYm,
        },
      });

    const expectedVisitor =
      26 * dayCount * 3;

    const expectedResource =
      25 * 19;

    const expectedStrength =
      25 * 10;

    if (
      visitorRows !==
      expectedVisitor
    ) {
      throw new Error(
        `Committed REGION_VISITOR validation failed: ` +
          `${visitorRows}/${expectedVisitor}`,
      );
    }

    if (
      resourceRows !==
      expectedResource
    ) {
      throw new Error(
        `Committed RESOURCE_DEMAND validation failed: ` +
          `${resourceRows}/${expectedResource}`,
      );
    }

    if (
      strengthRows !==
      expectedStrength
    ) {
      throw new Error(
        `Committed DEMAND_STRENGTH validation failed: ` +
          `${strengthRows}/${expectedStrength}`,
      );
    }

    return {
      visitor: {
        actual:
          visitorRows,

        expected:
          expectedVisitor,
      },

      resourceDemand: {
        actual:
          resourceRows,

        expected:
          expectedResource,
      },

      demandStrength: {
        actual:
          strengthRows,

        expected:
          expectedStrength,
      },
    };
  }

  async runGapNaverSync(
    baseYm: string,
  ) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(
        `Invalid GAP Naver baseYm: ${baseYm}`,
      );
    }

    const source =
      await this.getSource(
        'NAVER_DATALAB',
      );

    const run =
      await this.startRun(
        source.id,
        `month:${baseYm}`,
      );

    try {
      /*
      * 모든 외부 API 호출은 transaction 전에 끝낸다.
      *
      * prepare 단계에서는 DB source data를 변경하지 않는다.
      */
      const prepared =
        await this.naverService.prepareTourPlaceSearchTrends(
          baseYm,
        );

      /*
      * API 전체 수집/검증 성공 이후에만
      * normalized replacement + 새로운 RAW insert.
      */
      const result =
        await this.prisma.$transaction(
          async (tx) =>
            this.naverService.applyPreparedTourPlaceSearchTrends(
              prepared,
              tx,
            ),
          {
            maxWait:
              10_000,

            timeout:
              180_000,
          },
        );

      await this.completeRun(
        run.id,
        result.interestInsertedCount,
      );

      return {
        commonMonth:
          baseYm,

        ...result,
      };
    } catch (error) {
      await this.failRun(
        run.id,
        error,
      );

      throw error;
    }
  }


  @Cron(
    '0 0 3 18-22 * *',
    {
      timeZone:
        'Asia/Seoul',
    },
  )
  async scheduledGapRegionalSync() {
    if (
      this.gapRegionalSyncRunning
    ) {
      this.logger.warn(
        'GAP pipeline is already running. Skipping overlapping execution.',
      );

      return;
    }

    this.gapRegionalSyncRunning =
      true;

    try {
      this.logger.log(
        'Checking GAP regional data availability...',
      );

      const period =
        await this.gapDataPeriodService.findLatestCommonMonth();

      const baseYm =
        period.commonMonth;

      /*
      * 1. Regional
      */
      const regionalAlreadySynced =
        await this.isGapRegionalMonthAlreadySynced(
          baseYm,
        );

      if (
        regionalAlreadySynced
      ) {
        this.logger.log(
          `GAP regional month ${baseYm} already synced successfully. Skipping regional sync.`,
        );
      } else {
        this.logger.log(
          `Starting GAP regional sync for ${baseYm}`,
        );

        const regionalResult =
          await this.runGapRegionalSync(
            period,
          );

        this.logger.log(
          `GAP regional sync completed successfully: ${regionalResult.commonMonth}`,
        );
      }

      /*
      * 2. Naver DataLab
      *
      * regional이 이미 이전 실행에서 성공했더라도
      * 여기서 return하지 않는다.
      *
      * 동일 commonMonth를 끝점으로 하는 Naver window가
      * 성공했는지 별도로 확인한다.
      */
      const naverAlreadySynced =
        await this.isGapNaverMonthAlreadySynced(
          baseYm,
        );

      if (
        naverAlreadySynced
      ) {
        this.logger.log(
          `GAP Naver month ${baseYm} already synced successfully. Skipping Naver sync.`,
        );
      } else {
        this.logger.log(
          `Starting GAP Naver sync ending at ${baseYm}`,
        );

        const naverResult =
          await this.runGapNaverSync(
            baseYm,
          );

        this.logger.log(
          `GAP Naver sync completed successfully: ` +
            `${naverResult.startDate} ~ ${naverResult.endDate}`,
        );
      }

      /*
      * 3. GAP Score
      *
      * runGapScoreCalculation() 내부에서
      * regional + Naver SUCCESS를 다시 검증한다.
      *
      * 동일한 완성 run이 이미 존재하면
      * 새 history를 만들지 않고 skip한다.
      */
      this.logger.log(
        `Starting GAP score calculation for ${baseYm}`,
      );

      const gapResult =
        await this.runGapScoreCalculation(
          baseYm,
        );

      if (gapResult.skipped) {
        this.logger.log(
          `GAP score for ${baseYm} already exists. ` +
            `Skipping calculation: ` +
            `run=${gapResult.runId.toString()}, ` +
            `scores=${gapResult.scoreCount}`,
        );
      } else {
        this.logger.log(
          `GAP score calculation completed successfully: ` +
            `run=${gapResult.runId.toString()}, ` +
            `scores=${gapResult.scoreCount}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.stack ??
            error.message
          : String(error);

      this.logger.error(
        'Scheduled GAP pipeline failed',
        message,
      );
    } finally {
      this.gapRegionalSyncRunning =
        false;
    }
  }

private getCurrentKstMonthStart(): Date {
  /*
   * Asia/Seoul의 현재 연/월을 얻는다.
   *
   * Nest 서버가 UTC 등 어떤 timezone에서 실행되더라도
   * Tour scheduler의 calendar month 기준은 KST로 고정한다.
   */
  const parts =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
      },
    ).formatToParts(
      new Date(),
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
   * KST 기준 매월 1일 00:00
   * = UTC 기준 전월 말일 15:00
   */
  return new Date(
    Date.UTC(
      year,
      month - 1,
      1,
      -9,
      0,
      0,
    ),
  );
}

  private async isTourIncrementalSyncDue() {
    const source =
      await this.getSource(
        'TOUR_API',
      );

    const endpoint =
      'areaBasedSyncList2:seoul';

    const now =
      new Date();

    const currentMonthStart =
      this.getCurrentKstMonthStart();

    /*
    * 가장 최근 attempt 자체를 확인한다.
    *
    * SUCCESS만 확인하면 NON_RETRYABLE failure도
    * 매일 다시 실행될 수 있기 때문에
    * latest attempt 상태도 필요하다.
    */
    const latestRun =
      await this.prisma
        .externalSyncRun
        .findFirst({
          where: {
            sourceId:
              source.id,

            endpoint,

            syncType:
              'INCREMENTAL',
          },

          orderBy: {
            startedAt:
              'desc',
          },

          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            errorMessage: true,
          },
        });

    /*
    * 현재 KST calendar month에 이미 SUCCESS가 있으면
    * 이번 달 정기 sync는 완료된 것이다.
    */
    const currentMonthSuccess =
      await this.prisma
        .externalSyncRun
        .findFirst({
          where: {
            sourceId:
              source.id,

            endpoint,

            syncType:
              'INCREMENTAL',

            status:
              'SUCCESS',

            finishedAt: {
              gte:
                currentMonthStart,
            },
          },

          select: {
            id: true,
          },
        });

    if (
      currentMonthSuccess
    ) {
      return false;
    }

    /*
    * 한 번도 실행된 적이 없거나,
    * 이번 달 SUCCESS가 아직 없다면
    * 기본적으로 이번 달 sync 대상이다.
    *
    * 따라서 1일 05:00에 서버가 꺼져 있었어도
    * 2일/3일 scheduler에서 catch-up할 수 있다.
    */
    if (
      !latestRun
    ) {
      return true;
    }

    /*
    * RUNNING 중복 실행 방지.
    *
    * 단, 프로세스 crash 등으로 RUNNING 상태가
    * 영구적으로 남는 경우를 막기 위해
    * 6시간이 지나면 stale run으로 보고 재실행 가능.
    */
    if (
      latestRun.status ===
      'RUNNING'
    ) {
      const sixHoursMs =
        6 *
        60 *
        60 *
        1000;

      return (
        now.getTime() -
          latestRun.startedAt
            .getTime()
        >= sixHoursMs
      );
    }

    /*
    * 현재 달의 SUCCESS는 위에서 이미 걸러졌다.
    *
    * 가장 최근 FAILED가 이전 달 것이면
    * 새로운 calendar month가 시작된 것이므로
    * 새 정기 cycle을 실행한다.
    */
    const latestRunTime =
      latestRun.finishedAt ??
      latestRun.startedAt;

    if (
      latestRunTime <
      currentMonthStart
    ) {
      return true;
    }

    /*
    * 이 아래부터는 "이번 달에 이미 발생한 FAILED"이다.
    */
    if (
      latestRun.status ===
      'FAILED'
    ) {
      const errorMessage =
        latestRun.errorMessage ??
        '';

      /*
      * API quota / network / temporary upstream failure:
      * 같은 달이라도 다음날 재시도.
      */
      if (
        errorMessage.startsWith(
          'RETRYABLE:',
        )
      ) {
        const oneDayMs =
          24 *
          60 *
          60 *
          1000;

        return (
          now.getTime() -
            latestRunTime
              .getTime()
          >= oneDayMs
        );
      }

      /*
      * parser/configuration/data contract처럼
      * 똑같은 입력으로 다시 실행해도 해결되지 않는 실패:
      *
      * 같은 달에는 자동 재시도하지 않는다.
      * 다음 달 regular cycle 또는 manual force에서 재시도.
      */
      if (
        errorMessage.startsWith(
          'NON_RETRYABLE:',
        )
      ) {
        return false;
      }

      /*
      * 과거 코드에서 생성된 FAILED 등
      * retryability marker가 없는 legacy failure는
      * 보수적으로 하루 뒤 재시도한다.
      */
      const oneDayMs =
        24 *
        60 *
        60 *
        1000;

      return (
        now.getTime() -
          latestRunTime
            .getTime()
        >= oneDayMs
      );
    }

    /*
    * 예상하지 못한 status는 자동 실행하지 않는다.
    */
    return false;
  }

  private async runTourOperatingHoursNormalization(
    sourceId: bigint,
  ) {
    let normalizationRunId:
      bigint | null =
      null;

    try {
      /*
      * Tour 수집 run과 분리된 별도 run.
      *
      * 이 run의 실패는
      * areaBasedSyncList2:seoul의 성공 여부에
      * 영향을 주지 않는다.
      */
      const run =
        await this.prisma.externalSyncRun.create({
          data: {
            sourceId,

            endpoint:
              'operating-hours-normalize',

            syncType:
              'INCREMENTAL',

            status:
              'RUNNING',
          },
        });

      normalizationRunId =
        run.id;

      this.logger.log(
        `Starting TourAPI operating-hours normalization. ` +
          `run=${run.id.toString()}`,
      );

      await this.tourService
        .normalizeSeoulOperatingHours();

      await this.prisma.externalSyncRun.update({
        where: {
          id:
            run.id,
        },

        data: {
          status:
            'SUCCESS',

          finishedAt:
            new Date(),

          errorMessage:
            null,
        },
      });

      this.logger.log(
        `TourAPI operating-hours normalization complete. ` +
          `run=${run.id.toString()}`,
      );

      return {
        runId:
          run.id,

        status:
          'SUCCESS',
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      /*
      * normalizer 자체의 실패는
      * 같은 RAW + 같은 parser로 다음날
      * 반복할 이유가 없으므로 NON_RETRYABLE.
      *
      * 단, 이것은 별도 endpoint라
      * TourAPI 본체의 due 계산에는
      * 애초에 포함되지 않는다.
      */
      const storedMessage =
        `NON_RETRYABLE:` +
        `OPERATING_HOURS_NORMALIZATION_FAILED; ` +
        message;

      if (
        normalizationRunId !==
        null
      ) {
        try {
          await this.prisma.externalSyncRun.update({
            where: {
              id:
                normalizationRunId,
            },

            data: {
              status:
                'FAILED',

              finishedAt:
                new Date(),

              errorMessage:
                storedMessage.slice(
                  0,
                  5000,
                ),
            },
          });
        } catch (
          recordError
        ) {
          this.logger.error(
            `Failed to record TourAPI operating-hours normalization failure. ` +
              `run=${normalizationRunId.toString()}`,
            recordError instanceof Error
              ? recordError.stack
              : String(
                  recordError,
                ),
          );
        }
      }

      /*
      * 매우 중요:
      * 여기서 throw하지 않는다.
      *
      * 이미 성공한 TourAPI 수집 run을
      * outer catch가 FAILED로 바꾸면 안 된다.
      */
      this.logger.error(
        `TourAPI operating-hours normalization failed. ` +
          `run=${
            normalizationRunId !==
            null
              ? normalizationRunId.toString()
              : 'NOT_CREATED'
          }`,
        error instanceof Error
          ? error.stack
          : String(error),
      );

      return {
        runId:
          normalizationRunId,

        status:
          'FAILED',

        error:
          storedMessage.slice(
            0,
            5000,
          ),
      };
    }
  }

  /**
   * 서울 TourAPI 증분 동기화.
   *
   * 1. areaBasedSyncList2 변경분 수집/반영
   * 2. 변경된 기존 ACTIVE 장소의
   *    detailCommon2/detailIntro2 refresh
   * 3. 전체 단계 성공 시 sync run SUCCESS
   *
   * 신규/unmapped TourAPI contentId는
   * Place로 자동 생성하지 않는다.
   */
  async runTourIncrementalSync(
    force = false,
  ) {
    if (
      this.tourIncrementalSyncRunning
    ) {
      this.logger.warn(
        'TourAPI incremental sync is already running. Skipping overlapping execution.',
      );

      return {
        skipped: true,
        reason:
          'ALREADY_RUNNING',
      };
    }

    if (!force) {
      const due =
        await this.isTourIncrementalSyncDue();

      if (!due) {
        this.logger.log(
          'TourAPI incremental sync is not due yet. Skipping.',
        );

        return {
          skipped: true,
          reason:
            'NOT_DUE',
        };
      }
    }

    this.tourIncrementalSyncRunning =
      true;

    let runId:
      bigint | null =
      null;

    try {
      const source =
        await this.getSource(
          'TOUR_API',
        );

      const run =
        await this.prisma.externalSyncRun.create({
          data: {
            sourceId:
              source.id,

            endpoint:
              'areaBasedSyncList2:seoul',

            syncType:
              'INCREMENTAL',

            status:
              'RUNNING',
          },
        });

      runId =
        run.id;

      this.logger.log(
        `Starting TourAPI incremental sync. run=${run.id.toString()}`,
      );

      /*
       * Stage 1:
       * 변경 목록 + RAW + 기존 장소 LCLS.
       *
       * 내부적으로 API prepare 후
       * transaction apply.
       */
      const incremental =
        await this.tourService
          .syncSeoulIncremental();

      /*
       * Stage 2:
       * 변경된 기존 ACTIVE 장소의
       * detailCommon/detailIntro refresh.
       *
       * 이미 최신이면 targetCount=0.
       */
      const details =
        await this.tourService
          .refreshSeoulIncrementalDetails(
            850,
          );

      if (
        !details.completed
      ) {
        const prefix =
          details.retryable
            ? 'RETRYABLE'
            : 'NON_RETRYABLE';

        const message =
          `${prefix}:` +
          `${details.stopReason ?? 'TOUR_DETAIL_INCOMPLETE'}; ` +
          `apiCalls=${details.apiCallCount}; ` +
          `processedPlaces=${details.processedPlaceCount}; ` +
          `commonInserted=${details.commonInsertedCount}; ` +
          `introInserted=${details.introInsertedCount}`;

        await this.prisma.externalSyncRun.update({
          where: {
            id:
              run.id,
          },

          data: {
            status:
              'FAILED',

            finishedAt:
              new Date(),

            resultCount:
              incremental.fetchedCount,

            errorMessage:
              message.slice(
                0,
                5000,
              ),
          },
        });

        this.logger.warn(
          `TourAPI incremental sync stopped before completion. ` +
            `run=${run.id.toString()}, ` +
            `reason=${details.stopReason}, ` +
            `retryable=${details.retryable}, ` +
            `apiCalls=${details.apiCallCount}, ` +
            `processedPlaces=${details.processedPlaceCount}`,
        );

        return {
          skipped:
            false,

          runId:
            run.id,

          status:
            'FAILED',

          incremental,
          details,
        };
      }

      /*
       * 여기까지 왔다는 것은
       * detail refresh가 끝까지 완료됐다는 뜻.
       */
      await this.prisma.externalSyncRun.update({
        where: {
          id:
            run.id,
        },

        data: {
          status:
            'SUCCESS',

          finishedAt:
            new Date(),

          resultCount:
            incremental.fetchedCount,

          errorMessage:
            null,
        },
      });

      this.logger.log(
        `TourAPI incremental sync complete. ` +
          `run=${run.id.toString()}, ` +
          `fetched=${incremental.fetchedCount}, ` +
          `active=${incremental.activeCount}, ` +
          `inactive=${incremental.inactiveCount}, ` +
          `unmappedActive=${incremental.unmappedActiveCount}, ` +
          `detailCommon=${details.commonInsertedCount}, ` +
          `detailIntro=${details.introInsertedCount}, ` +
          `detailApiCalls=${details.apiCallCount}, ` +
          `detailNoDataCommon=${details.commonNoDataCount}, ` +
          `detailNoDataIntro=${details.introNoDataCount}`,
      );

      /*
      * Stage 3:
      * TourAPI 본체의 성공을 먼저 확정한 뒤
      * 운영시간 정규화를 별도 run으로 실행한다.
      *
      * 정규화 실패는 Tour 수집 성공을
      * 되돌리지 않는다.
      */
      const operatingHours =
        await this
          .runTourOperatingHoursNormalization(
            source.id,
          );

      return {
        skipped:
          false,

        runId:
          run.id,

        incremental,
        details,

        operatingHours,
      };
    } catch (error) {
      if (runId !== null) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        const upper =
          message.toUpperCase();

        const retryableFailure =
          upper.includes('429') ||
          upper.includes(
            'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
          ) ||
          upper.includes(
            'RESULTCODE=22',
          ) ||
          upper.includes(
            ': 22 ',
          ) ||
          /\b5\d\d\b/.test(
            upper,
          ) ||
          upper.includes(
            'FETCH FAILED',
          ) ||
          upper.includes(
            'ECONNRESET',
          ) ||
          upper.includes(
            'ECONNREFUSED',
          ) ||
          upper.includes(
            'ETIMEDOUT',
          ) ||
          upper.includes(
            'ENOTFOUND',
          ) ||
          upper.includes(
            'TIMEOUT',
          ) ||
          upper.includes(
            'SOCKET',
          ) ||
          upper.includes(
            'NETWORK',
          );

        const storedMessage =
          `${
            retryableFailure
              ? 'RETRYABLE'
              : 'NON_RETRYABLE'
          }:${message}`;

        await this.prisma.externalSyncRun.update({
          where: {
            id:
              runId,
          },

          data: {
            status:
              'FAILED',

            finishedAt:
              new Date(),

            errorMessage:
              storedMessage.slice(
                0,
                5000,
              ),
          },
        });
      }

      throw error;
    } finally {
      this.tourIncrementalSyncRunning =
        false;
    }
  }

  /**
   * TourAPI MONTHLY synchronization.
   *
   * 매일 05:00 KST에 scheduler가 실행되지만,
   * 실제 API sync는 KST calendar month별
   * 1회 SUCCESS만 허용한다.
   *
   * 즉 매월 1일을 새 cycle의 시작으로 보고,
   * 해당 월에 아직 SUCCESS가 없으면 실행한다.
   *
   * 매월 1일 서버가 일시적으로 내려가 있어도
   * 다음 날 자동 catch-up할 수 있다.
   *
   * RETRYABLE 실패:
   *   다음 날 재시도.
   *
   * NON_RETRYABLE 실패:
   *   같은 달에는 자동 반복하지 않고
   *   다음 달 cycle 또는 manual force에서 재시도.
   */
  @Cron(
    '0 0 5 * * *',
    {
      timeZone:
        'Asia/Seoul',
    },
  )
  async scheduledTourIncrementalSync() {
    try {
      const result =
        await this
          .runTourIncrementalSync(
            false,
          );

      if (
        result.skipped
      ) {
        this.logger.log(
          `Scheduled TourAPI sync skipped: ${result.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Scheduled TourAPI incremental sync failed',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }

  private async getNaverBlogRetryContext() {
    const source =
      await this.getSource(
        'NAVER_BLOG_SEARCH',
      );

    const latestRun =
      await this.prisma
        .externalSyncRun
        .findFirst({
          where: {
            sourceId:
              source.id,

            endpoint:
              'search/v1/blog:active-places',

            syncType:
              'INCREMENTAL',
          },

          orderBy: {
            startedAt:
              'desc',
          },

          select: {
            id: true,
            status: true,
            finishedAt: true,
            metadata: true,
          },
        });

    if (
      !latestRun ||
      latestRun.status !==
        'FAILED'
    ) {
      return null;
    }

    const metadata =
      latestRun.metadata;

    if (
      !metadata ||
      typeof metadata !==
        'object' ||
      Array.isArray(
        metadata,
      )
    ) {
      return null;
    }

    const rawFailedPlaceIds =
      (
        metadata as Record<
          string,
          unknown
        >
      ).failedPlaceIds;

    if (
      !Array.isArray(
        rawFailedPlaceIds,
      ) ||
      rawFailedPlaceIds.length ===
        0
    ) {
      return null;
    }

    const failedPlaceIds =
      rawFailedPlaceIds
        .filter(
          (value):
            value is string =>
            typeof value ===
            'string' &&
            /^\d+$/.test(
              value,
            ),
        )
        .map(
          (value) =>
            BigInt(
              value,
            ),
        );

    if (
      failedPlaceIds.length ===
      0
    ) {
      return null;
    }

    return {
      retryOfRunId:
        latestRun.id,

      failedPlaceIds,
    };
  }

  private async isNaverBlogSyncDue() {
    const source =
      await this.getSource(
        'NAVER_BLOG_SEARCH',
      );

    const latestRun =
      await this.prisma
        .externalSyncRun
        .findFirst({
          where: {
            sourceId:
              source.id,

            endpoint:
              'search/v1/blog:active-places',

            syncType:
              'INCREMENTAL',
          },

          orderBy: {
            startedAt:
              'desc',
          },

          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
          },
        });

    /*
    * 한 번도 실행한 적 없으면
    * 첫 full sync 실행.
    */
    if (!latestRun) {
      return true;
    }

    const now =
      Date.now();
    /*
    * 서버 crash/redeploy 등으로
    * RUNNING row만 남아 있을 수 있다.
    *
    * 6시간 이내면 아직 실행 중인 것으로 보고 skip,
    * 6시간 이상이면 stale run으로 보고 재실행을 허용한다.
    */
    if (
      latestRun.status ===
      'RUNNING'
    ) {
      const sixHoursMs =
        6 *
        60 *
        60 *
        1000;

      return (
        now -
          latestRun.startedAt
            .getTime()
        >= sixHoursMs
      );
}
    /*
    * 이전 run이 실패했다면
    * failed-place-only든 collector 전체 실패든
    * 하루 후 재시도한다.
    */
    if (
      latestRun.status ===
      'FAILED'
    ) {
      const failedAt =
        latestRun.finishedAt ??
        latestRun.startedAt;

      const oneDayMs =
        24 *
        60 *
        60 *
        1000;

      return (
        now -
          failedAt.getTime()
        >= oneDayMs
      );
    }

    /*
    * 정상 SUCCESS였다면
    * 기존 BIWEEKLY 정책 유지.
    */
    if (
      latestRun.status ===
      'SUCCESS'
    ) {
      const successAt =
        latestRun.finishedAt ??
        latestRun.startedAt;

      const fourteenDaysMs =
        14 *
        24 *
        60 *
        60 *
        1000;

      return (
        now -
          successAt.getTime()
        >= fourteenDaysMs
      );
    }

  /*
  * 현재 정의하지 않은 기타 status에서는
  * scheduler가 새 실행을 만들지 않는다.
  */
    return false;
  }

  async runNaverBlogSync(
    force = false,
    limit?: number,
  ) {
    if (
      this.naverBlogSyncRunning
    ) {
      this.logger.warn(
        'Naver Blog sync is already running. Skipping overlapping execution.',
      );

      return {
        skipped: true,
        reason:
          'ALREADY_RUNNING',
      };
    }

    if (!force) {
      const due =
        await this
          .isNaverBlogSyncDue();

      if (!due) {
        this.logger.log(
          'Naver Blog sync is not due yet. Skipping.',
        );

        return {
          skipped: true,
          reason:
            'NOT_DUE',
        };
      }
    }

    this.naverBlogSyncRunning =
      true;

    let runId:
      bigint | null =
      null;

    let retryContext: {
      retryOfRunId: bigint;
      failedPlaceIds: bigint[];
    } | null =
      null;

    try {
      const source =
        await this.getSource(
          'NAVER_BLOG_SEARCH',
        );

      /*
      * IMPORTANT:
      *
      * 새 RUNNING run을 만들기 전에
      * 이전 FAILED run을 확인해야 한다.
      *
      * 새 run을 먼저 만들면
      * "latest run"이 방금 생성한 RUNNING이 되어
      * 이전 실패 대상을 찾을 수 없게 된다.
      */
      if (!force) {
        retryContext =
          await this
            .getNaverBlogRetryContext();
      }

      const retryPlaceIds =
        retryContext
          ?.failedPlaceIds;

      const run =
        await this.prisma
          .externalSyncRun
          .create({
            data: {
              sourceId:
                source.id,

              endpoint:
                'search/v1/blog:active-places',

              syncType:
                'INCREMENTAL',

              status:
                'RUNNING',

              metadata: {
                mode:
                  retryContext
                    ? 'FAILED_ONLY_RETRY'
                    : 'FULL',

                retryOfRunId:
                  retryContext
                    ? retryContext
                        .retryOfRunId
                        .toString()
                    : null,

                retryTargetCount:
                  retryPlaceIds
                    ?.length ??
                  null,
              },
            },
          });

      runId =
        run.id;

      this.logger.log(
        `Starting Naver Blog sync. ` +
          `run=${run.id.toString()}` +
          (
            retryContext
              ? `, mode=FAILED_ONLY_RETRY` +
                `, retryOf=${retryContext.retryOfRunId.toString()}` +
                `, retryPlaces=${retryPlaceIds?.length ?? 0}`
              : ', mode=FULL'
          ) +
          (
            limit
              ? `, limit=${limit}`
              : ''
          ),
      );

      const result =
        await this.naverBlogService
          .syncActivePlaces(
            limit,
            retryPlaceIds,
          );

      /*
      * 장소별 partial progress는 보존한다.
      *
      * 단 한 곳이라도 실패하면
      * 전체 run을 거짓 SUCCESS로 기록하지 않는다.
      */
      const success =
        result.failedCount ===
        0;

      /*
      * 여기가 질문하신 metadata가 들어가는
      * "정상적으로 syncActivePlaces가 끝난 경우"의
      * externalSyncRun.update이다.
      */
      await this.prisma
        .externalSyncRun
        .update({
          where: {
            id:
              run.id,
          },

          data: {
            status:
              success
                ? 'SUCCESS'
                : 'FAILED',

            finishedAt:
              new Date(),

            resultCount:
              result.insertedCount,

            errorMessage:
              success
                ? null
                : (
                    `${result.failedCount} place(s) failed. ` +
                    result.failures
                      .slice(
                        0,
                        10,
                      )
                      .map(
                        (failure) =>
                          `${failure.placeId}: ${failure.error}`,
                      )
                      .join(
                        ' | ',
                      )
                  ).slice(
                    0,
                    5000,
                  ),

            /*
            * 구조화된 실행 결과.
            *
            * errorMessage는 사람이 읽기 위한 요약,
            * metadata는 다음 retry와 운영 추적을 위한
            * machine-readable 정보이다.
            */
            metadata: {
              mode:
                retryContext
                  ? 'FAILED_ONLY_RETRY'
                  : 'FULL',

              targetCount:
                result.targetCount,

              successCount:
                result.successCount,

              failedCount:
                result.failedCount,

              failedPlaceIds:
                result.failures.map(
                  (failure) =>
                    failure.placeId,
                ),

              retryOfRunId:
                retryContext
                  ? retryContext
                      .retryOfRunId
                      .toString()
                  : null,

              returnedItemCount:
                result.returnedItemCount,

              insertedCount:
                result.insertedCount,

              skippedExistingCount:
                result.skippedExistingCount,

              deletedOldCount:
                result.deletedOldCount,

              protectedOldCount:
                result.protectedOldCount,

              fallbackCount:
                result.fallbackCount,

              stillEmptyCount:
                result.stillEmptyCount,
            },
          },
        });

      if (!success) {
        this.logger.warn(
          `Naver Blog sync completed with failures. ` +
            `run=${run.id.toString()}, ` +
            `success=${result.successCount}, ` +
            `failed=${result.failedCount}`,
        );
      } else {
        this.logger.log(
          `Naver Blog sync complete. ` +
            `run=${run.id.toString()}, ` +
            `places=${result.targetCount}, ` +
            `inserted=${result.insertedCount}, ` +
            `existing=${result.skippedExistingCount}, ` +
            `deletedOld=${result.deletedOldCount}, ` +
            `fallback=${result.fallbackCount}, ` +
            `stillEmpty=${result.stillEmptyCount}`,
        );
      }

      return {
        skipped:
          false,

        runId:
          run.id,

        status:
          success
            ? 'SUCCESS'
            : 'FAILED',

        result,
      };
    } catch (error) {
      /*
      * 이 catch는 "개별 장소 실패"가 아니다.
      *
      * 개별 장소 실패는 syncActivePlaces 내부에서
      * catch되어 result.failures로 반환된다.
      *
      * 여기까지 throw된다는 것은 예:
      * - target 조회 실패
      * - DB 자체 장애
      * - 예상치 못한 collector-level exception
      * 같은 전체 실행 수준 실패이다.
      */
      if (
        runId !== null
      ) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await this.prisma
          .externalSyncRun
          .update({
            where: {
              id:
                runId,
            },

            data: {
              status:
                'FAILED',

              finishedAt:
                new Date(),

              errorMessage:
                message.slice(
                  0,
                  5000,
                ),

              /*
              * retry 중 collector 자체가 죽었다면
              * 원래 retry 대상 목록은 보존한다.
              *
              * FULL run 자체가 죽었다면 failedPlaceIds를
              * 정확히 알 수 없으므로 빈 배열로 둔다.
              * 다음 retry는 FULL로 수행된다.
              */
              metadata: {
                mode:
                  retryContext
                    ? 'FAILED_ONLY_RETRY'
                    : 'FULL',

                collectorFailure:
                  true,

                retryOfRunId:
                  retryContext
                    ? retryContext
                        .retryOfRunId
                        .toString()
                    : null,

                failedPlaceIds:
                  retryContext
                    ? retryContext
                        .failedPlaceIds
                        .map(
                          (id) =>
                            id.toString(),
                        )
                    : [],

                error:
                  message.slice(
                    0,
                    5000,
                  ),
              },
            },
          });
      }

      throw error;
    } finally {
      this.naverBlogSyncRunning =
        false;
    }
  }

  /**
   * Naver Blog BIWEEKLY synchronization.
   *
   * 매일 06:00 KST에 due 여부를 확인한다.
   *
   * 정상 SUCCESS:
   *   마지막 성공 후 14일이 지나면
   *   전체 active-place sync를 수행한다.
   *
   * FAILED:
   *   24시간 후 재시도한다.
   *
   * 장소별 실패 목록을 식별할 수 있으면
   * failed-place-only retry를 수행한다.
   *
   * collector-level failure처럼
   * 실패 대상을 특정할 수 없으면
   * 다음 retry는 FULL sync로 수행한다.
   *
   * RUNNING:
   *   6시간 미만이면 실행 중으로 보고 skip,
   *   6시간 이상이면 stale run으로 보고 재실행한다.
   */
  @Cron(
    '0 0 6 * * *',
    {
      timeZone:
        'Asia/Seoul',
    },
  )
  async scheduledNaverBlogSync() {
    try {
      const result =
        await this.runNaverBlogSync(
          false,
        );

      if (
        result.skipped
      ) {
        this.logger.log(
          `Scheduled Naver Blog sync skipped: ${result.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Scheduled Naver Blog sync failed',
        error instanceof Error
          ? error.stack
          : String(error),
      );
    }
  }

}