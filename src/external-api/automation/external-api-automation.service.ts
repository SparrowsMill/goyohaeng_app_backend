import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';

import { RegionVisitorService } from '../region-visitor/region-visitor.service';
import { TourismResourceDemandService } from '../tourism-resource-demand/tourism-resource-demand.service';
import { TourismDemandStrengthService } from '../tourism-demand-strength/tourism-demand-strength.service';

import { GapDataPeriodService } from './gap-data-period.service';
import { NaverService } from '../naver/naver.service';
import { GapScoreCalculationService } from './gap-score-calculation.service';

@Injectable()
export class ExternalApiAutomationService {
    private readonly logger =
    new Logger(
      ExternalApiAutomationService.name,
    );

  private gapRegionalSyncRunning =
    false;

  constructor(
    private readonly prisma: PrismaService,

    private readonly regionVisitorService: RegionVisitorService,
    private readonly resourceDemandService: TourismResourceDemandService,
    private readonly demandStrengthService: TourismDemandStrengthService,

    private readonly gapDataPeriodService: GapDataPeriodService,
    private readonly naverService: NaverService,
    private readonly gapScoreCalculationService: GapScoreCalculationService,

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
   */
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

}