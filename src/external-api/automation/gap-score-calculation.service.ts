import {
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const FORMULA_VERSION =
  'GAP_V1_PROXY';

const DATA_STAGE =
  'COLD_START';

type RawGapScoreRow = {
  place_id: bigint;
  gap_metric_mapping_id: bigint;

  comparison_region_id: bigint | null;
  comparison_category_id: bigint | null;

  sns_metric_code: string | null;

  naver_percentile: number | null;
  sns_percentile: number | null;
  navigation_percentile: number | null;

  visitor_percentile: number | null;
  expenditure_percentile: number | null;
  nonlocal_visitor_percentile: number | null;

  online_score: number | null;
  offline_score: number | null;

  gap_score: number;
  gap_percentile: number;
};

export type PreparedGapScore = {
  placeId: bigint;
  gapMetricMappingId: bigint;

  comparisonRegionId: bigint | null;
  comparisonCategoryId: bigint | null;

  snsMetricCode: string | null;

  naverPercentile: number;
  snsPercentile: number | null;
  navigationPercentile: number | null;

  visitorPercentile: number | null;
  expenditurePercentile: number | null;
  nonlocalVisitorPercentile: number | null;

  onlineScore: number;
  offlineScore: number;

  gapScore: number;
  gapPercentile: number;
};

export type PreparedGapScoreCalculation = {
  formulaVersion: string;
  dataStage: string;

  regionalMetricMonth: string;

  naverStartDate: Date;
  naverEndDate: Date;

  visitorStartDate: Date;
  visitorEndDate: Date;

  naverReferenceTerm: string;

  calculatedAt: Date;

  rows: PreparedGapScore[];
};

@Injectable()
export class GapScoreCalculationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private getMonthRange(
    baseYm: string,
  ) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(
        `invalid YYYYMM: ${baseYm}`,
      );
    }

    const year =
      Number(baseYm.slice(0, 4));

    const month =
      Number(baseYm.slice(4, 6));

    if (
      month < 1 ||
      month > 12
    ) {
      throw new Error(
        `invalid YYYYMM: ${baseYm}`,
      );
    }

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
          month,
          0,
        ),
      );

    return {
      startDate,
      endDate,
    };
  }

  private extractReferenceTerm(
    requestPayload: unknown,
  ): string {
    const payload =
      requestPayload as {
        keywordGroups?: Array<{
          groupName?: string;
          title?: string;
          keywords?: string[];
        }>;
      };

    const group =
      payload.keywordGroups?.find(
        (item) =>
          item.groupName ===
            'REFERENCE' ||
          item.title ===
            'REFERENCE',
      );

    const term =
      group?.keywords?.[0];

    if (
      typeof term === 'string' &&
      term.trim().length > 0
    ) {
      return term.trim();
    }

    const envReference =
      process.env.NAVER_REFERENCE_TERM;

    if (
      envReference &&
      envReference.trim().length > 0
    ) {
      return envReference.trim();
    }

    throw new Error(
      'Cannot resolve Naver reference term.',
    );
  }

  async prepareGapScores(
    baseYm: string,
  ): Promise<PreparedGapScoreCalculation> {
    const {
      startDate:
        visitorStartDate,
      endDate:
        visitorEndDate,
    } =
      this.getMonthRange(
        baseYm,
      );

    const naverSource =
      await this.prisma.externalSource.findUnique({
        where: {
          code: 'NAVER_DATALAB',
        },
      });

    if (!naverSource) {
      throw new Error(
        'NAVER_DATALAB source not found',
      );
    }

    /*
     * 해당 regional month를 끝으로 하는
     * 가장 최근 Naver RAW window를 사용한다.
     */
    const latestNaverRaw =
      await this.prisma.rawNaverDatalabApi.findFirst({
        where: {
          sourceId:
            naverSource.id,

          endDate:
            visitorEndDate,

          timeUnit:
            'month',
        },

        orderBy: {
          fetchedAt:
            'desc',
        },

        select: {
          startDate: true,
          endDate: true,
          requestPayload: true,
        },
      });

    if (!latestNaverRaw) {
      throw new Error(
        `Naver RAW window ending at ${baseYm} not found`,
      );
    }

    const naverStartDate =
      latestNaverRaw.startDate;

    const naverEndDate =
      latestNaverRaw.endDate;

    const naverReferenceTerm =
      this.extractReferenceTerm(
        latestNaverRaw.requestPayload,
      );

    /*
     * GAP_V1_PROXY mapping이 한 장소에
     * 두 개 이상 걸려 있으면 score row를
     * 하나로 결정할 수 없으므로 즉시 중단.
     */
    const duplicateMappings =
      await this.prisma.$queryRaw<
        Array<{
          place_id: bigint;
          mapping_count: number;
        }>
      >`
        SELECT
          pec.place_id,
          COUNT(*)::int
            AS mapping_count

        FROM place_external_categories pec

        JOIN gap_metric_mappings gm
          ON gm.external_category_id =
             pec.external_category_id

        WHERE
          gm.formula_version =
            ${FORMULA_VERSION}

        GROUP BY
          pec.place_id

        HAVING
          COUNT(*) > 1

        LIMIT 20
      `;

    if (
      duplicateMappings.length > 0
    ) {
      throw new Error(
        `Multiple GAP mappings found for place(s): ` +
        duplicateMappings
          .map(
            (row) =>
              `${row.place_id.toString()}(${row.mapping_count})`,
          )
          .join(', '),
      );
    }

    /*
     * ---------------------------------------------------------
     * N
     * ---------------------------------------------------------
     *
     * 월별:
     *
     *   place ratio
     *   ----------------
     *   REFERENCE ratio
     *
     * → 존재하는 월만 AVG
     * → 전체 usable place PERCENT_RANK
     *
     * ---------------------------------------------------------
     * S / M
     * ---------------------------------------------------------
     *
     * gap_metric_mappings의 실제 code를 사용한다.
     * hard-code된 category mapping은 만들지 않는다.
     *
     * ---------------------------------------------------------
     * V
     * ---------------------------------------------------------
     *
     * visitor type 1+2+3
     * → district/day 합
     * → district 월평균
     * → 25개 district PERCENT_RANK
     *
     * ---------------------------------------------------------
     * E = 2203
     * T = 2101
     * ---------------------------------------------------------
     */
    const rawRows =
      await this.prisma.$queryRaw<
        RawGapScoreRow[]
      >`
        WITH
        district_ids AS (
          SELECT DISTINCT
            p.district_region_id
              AS region_id

          FROM places p

          WHERE
            p.district_region_id
              IS NOT NULL
        ),

        naver_monthly_relative AS (
          SELECT
            nst.place_id,

            nsi.period_start,

            (
              nsi.ratio::numeric
              /
              NULLIF(
                (
                  ref_point
                    ->> 'ratio'
                )::numeric,
                0
              )
            ) AS relative_interest

          FROM naver_search_interest nsi

          JOIN naver_search_terms nst
            ON nst.id =
               nsi.naver_search_term_id

          JOIN raw_naver_datalab_api raw
            ON raw.id =
               nsi.raw_naver_datalab_id

          JOIN LATERAL
            jsonb_array_elements(
              raw.response_payload
                -> 'results'
            ) ref_result
            ON (
              ref_result ->> 'title'
            ) = 'REFERENCE'

          JOIN LATERAL
            jsonb_array_elements(
              ref_result -> 'data'
            ) ref_point
            ON (
              ref_point ->> 'period'
            )::date =
               nsi.period_start

          WHERE
            nst.is_active = true

            AND
            nsi.period_start >=
              CAST(
                ${naverStartDate}
                AS date
              )

            AND
            nsi.period_start <=
              CAST(
                ${naverEndDate}
                AS date
              )

            AND
            raw.start_date =
              CAST(
                ${naverStartDate}
                AS date
              )

            AND
            raw.end_date =
              CAST(
                ${naverEndDate}
                AS date
              )
        ),

        naver_place_average AS (
          SELECT
            place_id,

            AVG(
              relative_interest
            ) AS avg_relative_interest

          FROM
            naver_monthly_relative

          WHERE
            relative_interest
              IS NOT NULL

          GROUP BY
            place_id
        ),

        naver_ranked AS (
          SELECT
            place_id,

            PERCENT_RANK()
              OVER (
                ORDER BY
                  avg_relative_interest
              )
              AS naver_percentile

          FROM
            naver_place_average
        ),

        resource_ranked AS (
          SELECT
            rm.region_id,
            rm.metric_code,

            PERCENT_RANK()
              OVER (
                PARTITION BY
                  rm.metric_code

                ORDER BY
                  rm.metric_value
              )
              AS percentile

          FROM
            region_metrics rm

          JOIN external_sources es
            ON es.id =
               rm.source_id

          JOIN district_ids d
            ON d.region_id =
               rm.region_id

          WHERE
            es.code =
              'TOURISM_RESOURCE_DEMAND_API'

            AND
            rm.period_month =
              ${baseYm}
        ),

        visitor_daily AS (
          SELECT
            rm.region_id,
            rm.period_date,

            SUM(
              rm.metric_value
            ) AS daily_visitors

          FROM
            region_metrics rm

          JOIN external_sources es
            ON es.id =
               rm.source_id

          JOIN district_ids d
            ON d.region_id =
               rm.region_id

          WHERE
            es.code =
              'REGION_VISITOR_API'

            AND
            rm.metric_family =
              'VISITOR'

            AND
            rm.metric_code =
              'TOU_NUM'

            AND
            rm.visitor_type_code
              IN ('1', '2', '3')

            AND
            rm.period_date >=
              CAST(
                ${visitorStartDate}
                AS date
              )

            AND
            rm.period_date <=
              CAST(
                ${visitorEndDate}
                AS date
              )

          GROUP BY
            rm.region_id,
            rm.period_date
        ),

        visitor_monthly AS (
          SELECT
            region_id,

            AVG(
              daily_visitors
            ) AS monthly_avg_visitors

          FROM
            visitor_daily

          GROUP BY
            region_id
        ),

        visitor_ranked AS (
          SELECT
            region_id,

            PERCENT_RANK()
              OVER (
                ORDER BY
                  monthly_avg_visitors
              )
              AS percentile

          FROM
            visitor_monthly
        ),

        strength_ranked AS (
          SELECT
            rm.region_id,
            rm.metric_code,

            PERCENT_RANK()
              OVER (
                PARTITION BY
                  rm.metric_code

                ORDER BY
                  rm.metric_value
              )
              AS percentile

          FROM
            region_metrics rm

          JOIN external_sources es
            ON es.id =
               rm.source_id

          JOIN district_ids d
            ON d.region_id =
               rm.region_id

          WHERE
            es.code =
              'TOURISM_DEMAND_STRENGTH_API'

            AND
            rm.period_month =
              ${baseYm}

            AND
            rm.metric_code
              IN (
                '2203',
                '2101'
              )
        ),

        candidates AS (
          SELECT
            p.id
              AS place_id,

            gm.id
              AS gap_metric_mapping_id,

            p.district_region_id
              AS comparison_region_id,

            NULL::bigint
              AS comparison_category_id,

            gm.sns_metric_code,

            nr.naver_percentile,

            sr.percentile
              AS sns_percentile,

            mr.percentile
              AS navigation_percentile,

            vr.percentile
              AS visitor_percentile,

            er.percentile
              AS expenditure_percentile,

            tr.percentile
              AS nonlocal_visitor_percentile

          FROM
            naver_ranked nr

          JOIN places p
            ON p.id =
               nr.place_id

          JOIN place_external_categories pec
            ON pec.place_id =
               p.id

          JOIN gap_metric_mappings gm
            ON gm.external_category_id =
               pec.external_category_id

           AND gm.formula_version =
               ${FORMULA_VERSION}

          LEFT JOIN resource_ranked sr
            ON sr.region_id =
               p.district_region_id

           AND sr.metric_code =
               gm.sns_metric_code

          LEFT JOIN resource_ranked mr
            ON mr.region_id =
               p.district_region_id

           AND mr.metric_code =
               gm.navigation_metric_code

          LEFT JOIN visitor_ranked vr
            ON vr.region_id =
               p.district_region_id

          LEFT JOIN strength_ranked er
            ON er.region_id =
               p.district_region_id

           AND er.metric_code =
               '2203'

          LEFT JOIN strength_ranked tr
            ON tr.region_id =
               p.district_region_id

           AND tr.metric_code =
               '2101'

          WHERE
            p.district_region_id
              IS NOT NULL
        ),

        scored_components AS (
          SELECT
            *,

            (
              (
                0.60 *
                  naver_percentile

                +

                CASE
                  WHEN
                    sns_percentile
                      IS NOT NULL
                  THEN
                    0.20 *
                      sns_percentile
                  ELSE 0
                END

                +

                CASE
                  WHEN
                    navigation_percentile
                      IS NOT NULL
                  THEN
                    0.20 *
                      navigation_percentile
                  ELSE 0
                END
              )

              /

              (
                0.60

                +

                CASE
                  WHEN
                    sns_percentile
                      IS NOT NULL
                  THEN 0.20
                  ELSE 0
                END

                +

                CASE
                  WHEN
                    navigation_percentile
                      IS NOT NULL
                  THEN 0.20
                  ELSE 0
                END
              )
            ) AS online_score,

            (
              (
                CASE
                  WHEN
                    visitor_percentile
                      IS NOT NULL
                  THEN
                    0.60 *
                      visitor_percentile
                  ELSE 0
                END

                +

                CASE
                  WHEN
                    expenditure_percentile
                      IS NOT NULL
                  THEN
                    0.25 *
                      expenditure_percentile
                  ELSE 0
                END

                +

                CASE
                  WHEN
                    nonlocal_visitor_percentile
                      IS NOT NULL
                  THEN
                    0.15 *
                      nonlocal_visitor_percentile
                  ELSE 0
                END
              )

              /

              NULLIF(
                (
                  CASE
                    WHEN
                      visitor_percentile
                        IS NOT NULL
                    THEN 0.60
                    ELSE 0
                  END

                  +

                  CASE
                    WHEN
                      expenditure_percentile
                        IS NOT NULL
                    THEN 0.25
                    ELSE 0
                  END

                  +

                  CASE
                    WHEN
                      nonlocal_visitor_percentile
                        IS NOT NULL
                    THEN 0.15
                    ELSE 0
                  END
                ),
                0
              )
            ) AS offline_score

          FROM
            candidates
        ),

        scored AS (
          SELECT
            *,

            (
              50

              +

              50
              *
              (
                0.5
                +
                0.5 *
                  online_score
              )
              *
              (
                online_score
                -
                offline_score
              )
            ) AS gap_score

          FROM
            scored_components

          WHERE
            online_score IS NOT NULL

            AND
            offline_score IS NOT NULL
        ),

        final_ranked AS (
          SELECT
            *,

            PERCENT_RANK()
              OVER (
                ORDER BY
                  gap_score
              )
              AS gap_percentile

          FROM
            scored
        )

        SELECT
          place_id,
          gap_metric_mapping_id,

          comparison_region_id,
          comparison_category_id,

          sns_metric_code,

          naver_percentile::double precision
            AS naver_percentile,

          sns_percentile::double precision
            AS sns_percentile,

          navigation_percentile::double precision
            AS navigation_percentile,

          visitor_percentile::double precision
            AS visitor_percentile,

          expenditure_percentile::double precision
            AS expenditure_percentile,

          nonlocal_visitor_percentile::double precision
            AS nonlocal_visitor_percentile,

          online_score::double precision
            AS online_score,

          offline_score::double precision
            AS offline_score,

          gap_score::double precision
            AS gap_score,

          gap_percentile::double precision
            AS gap_percentile

        FROM
          final_ranked

        ORDER BY
          place_id
      `;

    if (
      rawRows.length === 0
    ) {
      throw new Error(
        'GAP calculation produced 0 rows',
      );
    }

    const seenPlaceIds =
      new Set<string>();

    for (
      const row
      of rawRows
    ) {
      const key =
        row.place_id.toString();

      if (
        seenPlaceIds.has(key)
      ) {
        throw new Error(
          `Duplicate GAP score candidate: place ${key}`,
        );
      }

      seenPlaceIds.add(key);

      if (
        row.naver_percentile ==
          null
      ) {
        throw new Error(
          `Missing N for place ${key}`,
        );
      }

      if (
        row.online_score == null ||
        row.offline_score == null ||
        row.gap_score == null ||
        row.gap_percentile == null
      ) {
        throw new Error(
          `Incomplete GAP result for place ${key}`,
        );
      }
    }

    const rows:
      PreparedGapScore[] =
        rawRows.map(
          (row) => ({
            placeId:
              row.place_id,

            gapMetricMappingId:
              row.gap_metric_mapping_id,

            comparisonRegionId:
              row.comparison_region_id,

            comparisonCategoryId:
              row.comparison_category_id,

            snsMetricCode:
              row.sns_metric_code,

            naverPercentile:
              row.naver_percentile!,

            snsPercentile:
              row.sns_percentile,

            navigationPercentile:
              row.navigation_percentile,

            visitorPercentile:
              row.visitor_percentile,

            expenditurePercentile:
              row.expenditure_percentile,

            nonlocalVisitorPercentile:
              row.nonlocal_visitor_percentile,

            onlineScore:
              row.online_score!,

            offlineScore:
              row.offline_score!,

            gapScore:
              row.gap_score,

            gapPercentile:
              row.gap_percentile,
          }),
        );

    return {
      formulaVersion:
        FORMULA_VERSION,

      dataStage:
        DATA_STAGE,

      regionalMetricMonth:
        baseYm,

      naverStartDate,
      naverEndDate,

      visitorStartDate,
      visitorEndDate,

      naverReferenceTerm,

      calculatedAt:
        new Date(),

      rows,
    };
  }

  async applyPreparedGapScores(
    prepared:
      PreparedGapScoreCalculation,
    tx: any,
  ) {
    const run =
      await tx.gapScoreRun.create({
        data: {
          formulaVersion:
            prepared.formulaVersion,

          dataStage:
            prepared.dataStage,

          naverStartDate:
            prepared.naverStartDate,

          naverEndDate:
            prepared.naverEndDate,

          regionalMetricMonth:
            prepared.regionalMetricMonth,

          visitorStartDate:
            prepared.visitorStartDate,

          visitorEndDate:
            prepared.visitorEndDate,

          naverReferenceTerm:
            prepared.naverReferenceTerm,

          calculatedAt:
            prepared.calculatedAt,
        },
      });

    const inserted =
      await tx.gapScoreHistory.createMany({
        data:
          prepared.rows.map(
            (row) => ({
              placeId:
                row.placeId,

              runId:
                run.id,

              gapMetricMappingId:
                row.gapMetricMappingId,

              calculatedAt:
                prepared.calculatedAt,

              formulaVersion:
                prepared.formulaVersion,

              dataStage:
                prepared.dataStage,

              comparisonRegionId:
                row.comparisonRegionId,

              comparisonCategoryId:
                row.comparisonCategoryId,

              naverPercentile:
                row.naverPercentile,

              snsPercentile:
                row.snsPercentile,

              navigationPercentile:
                row.navigationPercentile,

              visitorPercentile:
                row.visitorPercentile,

              expenditurePercentile:
                row.expenditurePercentile,

              nonlocalVisitorPercentile:
                row.nonlocalVisitorPercentile,

              onlineScore:
                row.onlineScore,

              offlineScore:
                row.offlineScore,

              gapScore:
                row.gapScore,

              gapPercentile:
                row.gapPercentile,

              explanationText:
                null,
            }),
          ),
      });

    if (
      inserted.count !==
        prepared.rows.length
    ) {
      throw new Error(
        `GAP insert mismatch: ` +
        `expected=${prepared.rows.length}, ` +
        `actual=${inserted.count}`,
      );
    }

    const actual =
      await tx.gapScoreHistory.count({
        where: {
          runId:
            run.id,
        },
      });

    if (
      actual !==
        prepared.rows.length
    ) {
      throw new Error(
        `GAP validation mismatch: ` +
        `expected=${prepared.rows.length}, ` +
        `actual=${actual}`,
      );
    }

    return {
      runId:
        run.id,

      scoreCount:
        actual,
    };
  }

  async calculateAndStoreGapScores(
    baseYm: string,
  ) {
    /*
    * 모든 계산/검증은 transaction 진입 전에 수행.
    */
    const prepared =
      await this.prepareGapScores(
        baseYm,
      );

    this.validatePreparedForProduction(
      prepared,
    );

    const lockKey =
      [
        prepared.formulaVersion,
        prepared.dataStage,
        prepared.regionalMetricMonth,
        prepared.naverStartDate
          .toISOString()
          .slice(0, 10),
        prepared.naverEndDate
          .toISOString()
          .slice(0, 10),
      ].join(':');

    return this.prisma.$transaction(
      async (tx) => {
        /*
        * 여러 서버 instance가 동시에 cron을 실행해도
        * 동일 GAP run을 중복 생성하지 않도록
        * transaction-level advisory lock.
        */
        await tx.$executeRaw`
          SELECT
            pg_advisory_xact_lock(
              hashtext(${lockKey})::bigint
            )
        `;

        const existing =
          await tx.gapScoreRun.findFirst({
            where: {
              formulaVersion:
                prepared.formulaVersion,

              dataStage:
                prepared.dataStage,

              regionalMetricMonth:
                prepared.regionalMetricMonth,

              naverStartDate:
                prepared.naverStartDate,

              naverEndDate:
                prepared.naverEndDate,

              visitorStartDate:
                prepared.visitorStartDate,

              visitorEndDate:
                prepared.visitorEndDate,

              naverReferenceTerm:
                prepared.naverReferenceTerm,
            },

            orderBy: {
              calculatedAt:
                'desc',
            },
          });

        if (existing) {
          const stats =
            await tx.$queryRaw<
              Array<{
                score_count: number;
                n_count: number;
                s_count: number;
                m_count: number;
                v_count: number;
                e_count: number;
                t_count: number;
                nonnull_category_count: number;
              }>
            >`
              SELECT
                COUNT(*)::int
                  AS score_count,

                COUNT(naver_percentile)::int
                  AS n_count,

                COUNT(sns_percentile)::int
                  AS s_count,

                COUNT(navigation_percentile)::int
                  AS m_count,

                COUNT(visitor_percentile)::int
                  AS v_count,

                COUNT(expenditure_percentile)::int
                  AS e_count,

                COUNT(nonlocal_visitor_percentile)::int
                  AS t_count,

                COUNT(*) FILTER (
                  WHERE
                    comparison_category_id
                      IS NOT NULL
                )::int
                  AS nonnull_category_count

              FROM gap_score_history

              WHERE
                run_id = ${existing.id}
            `;

          const row =
            stats[0];

          if (
            !row ||
            row.score_count !==
              prepared.rows.length ||
            row.n_count !==
              prepared.rows.length ||
            row.m_count !==
              prepared.rows.length ||
            row.v_count !==
              prepared.rows.length ||
            row.e_count !==
              prepared.rows.length ||
            row.t_count !==
              prepared.rows.length ||
            row.nonnull_category_count !== 0
          ) {
            throw new Error(
              `Existing GAP run is incomplete/conflicting: ` +
              `runId=${existing.id.toString()}, ` +
              `expected=${prepared.rows.length}, ` +
              `actual=${row?.score_count ?? 0}`,
            );
          }

          return {
            skipped:
              true,

            runId:
              existing.id,

            scoreCount:
              row.score_count,

            componentCounts: {
              N: row.n_count,
              S: row.s_count,
              M: row.m_count,
              V: row.v_count,
              E: row.e_count,
              T: row.t_count,
            },
          };
        }

        const result =
          await this.applyPreparedGapScores(
            prepared,
            tx,
          );

        return {
          skipped:
            false,

          ...result,
        };
      },
      {
        maxWait:
          10_000,

        timeout:
          60_000,
      },
    );
  }

  private validatePreparedForProduction(
    prepared: PreparedGapScoreCalculation,
  ) {
    if (prepared.rows.length === 0) {
      throw new Error(
        'GAP production validation failed: 0 rows',
      );
    }

    for (const row of prepared.rows) {
      const placeId =
        row.placeId.toString();

      /*
      * N은 GAP의 핵심 장소 단위 지표이므로 필수.
      */
      if (
        row.naverPercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `N missing for place ${placeId}`,
        );
      }

      /*
      * S는 mapping 자체가 없는 SH(쇼핑)만
      * 정상적인 NULL이다.
      */
      if (
        row.snsMetricCode !== null &&
        row.snsPercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `S missing for mapped place ${placeId}`,
        );
      }

      if (
        row.snsMetricCode === null &&
        row.snsPercentile !== null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `unexpected S for unmapped place ${placeId}`,
        );
      }

      /*
      * 계산식 자체는 nullable + 재정규화를 지원하지만,
      * 정상 monthly pipeline에서는 M/V/E/T가
      * 모두 존재해야 한다.
      */
      if (
        row.navigationPercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `M missing for place ${placeId}`,
        );
      }

      if (
        row.visitorPercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `V missing for place ${placeId}`,
        );
      }

      if (
        row.expenditurePercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `E missing for place ${placeId}`,
        );
      }

      if (
        row.nonlocalVisitorPercentile == null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `T missing for place ${placeId}`,
        );
      }

      /*
      * 현재 GAP 분류는 TourAPI external category이므로
      * 내부 Category FK를 저장하지 않는다.
      */
      if (
        row.comparisonCategoryId !== null
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `comparisonCategoryId must be NULL ` +
          `for place ${placeId}`,
        );
      }

      const numericValues = [
        row.naverPercentile,
        row.snsPercentile,
        row.navigationPercentile,
        row.visitorPercentile,
        row.expenditurePercentile,
        row.nonlocalVisitorPercentile,
        row.onlineScore,
        row.offlineScore,
        row.gapScore,
        row.gapPercentile,
      ].filter(
        (value): value is number =>
          value !== null,
      );

      if (
        numericValues.some(
          (value) =>
            !Number.isFinite(value),
        )
      ) {
        throw new Error(
          `GAP production validation failed: ` +
          `non-finite number for place ${placeId}`,
        );
      }
    }
  }
}