import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

type NaverTrendPoint = {
  period: string;
  ratio: number;
};

type NaverTrendResult = {
  title: string;
  keywords: string[];
  data: NaverTrendPoint[];
};

type NaverTrendResponse = {
  startDate: string;
  endDate: string;
  timeUnit: string;
  results: NaverTrendResult[];
};

type NaverTargetTerm = {
  id: bigint;
  placeId: bigint;
  searchTerm: string;
};

type PreparedNaverBatch = {
  batchIndex: number;
  requestPayload: Record<string, unknown>;
  response: NaverTrendResponse;
};

type PreparedNaverTrendSync = {
  sourceId: bigint;
  referenceTerm: string;
  startDate: string;
  endDate: string;
  timeUnit: 'month';
  targets: NaverTargetTerm[];
  batches: PreparedNaverBatch[];
  expectedInterestCount: number;
};

@Injectable()
export class NaverService {
  private readonly baseUrl =
    'https://naverapihub.apigw.ntruss.com/search-trend/v1/search';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getCredentials() {
    const clientId =
      this.configService.get<string>('NAVER_API_CLIENT_ID');

    const clientSecret =
      this.configService.get<string>('NAVER_API_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error(
        'NAVER_API_CLIENT_ID or NAVER_API_CLIENT_SECRET is not defined',
      );
    }

    return {
      clientId,
      clientSecret,
    };
  }

  private getReferenceTerm(): string {
    const referenceTerm =
      this.configService
        .get<string>('NAVER_REFERENCE_TERM')
        ?.trim();

    if (!referenceTerm) {
      throw new Error(
        'NAVER_REFERENCE_TERM is not defined.',
      );
    }

    return referenceTerm;
  }

  private getLookbackMonths(): number {
    const raw =
      this.configService.get<string>('NAVER_LOOKBACK_MONTHS');

    const months = Number(raw ?? 6);

    if (
      !Number.isInteger(months) ||
      months < 1 ||
      months > 60
    ) {
      throw new Error(
        'NAVER_LOOKBACK_MONTHS must be an integer between 1 and 60',
      );
    }

    return months;
  }

  private formatDateUtc(date: Date): string {
    const year = date.getUTCFullYear();

    const month =
      String(date.getUTCMonth() + 1).padStart(2, '0');

    const day =
      String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getDateRange(
    endYm?: string,
  ) {
    const months =
      this.getLookbackMonths();

    let endYear: number;
    let endMonth: number;

    if (endYm !== undefined) {
      if (!/^\d{6}$/.test(endYm)) {
        throw new Error(
          `Invalid Naver endYm: ${endYm}`,
        );
      }

      endYear =
        Number(endYm.slice(0, 4));

      endMonth =
        Number(endYm.slice(4, 6));

      if (
        endMonth < 1 ||
        endMonth > 12
      ) {
        throw new Error(
          `Invalid Naver endYm: ${endYm}`,
        );
      }
    } else {
      const kstNow =
        new Date(
          Date.now() +
            9 * 60 * 60 * 1000,
        );

      const currentYear =
        kstNow.getUTCFullYear();

      const currentMonthIndex =
        kstNow.getUTCMonth();

      const previousMonthEnd =
        new Date(
          Date.UTC(
            currentYear,
            currentMonthIndex,
            0,
          ),
        );

      endYear =
        previousMonthEnd.getUTCFullYear();

      endMonth =
        previousMonthEnd.getUTCMonth() + 1;
    }

    const end =
      new Date(
        Date.UTC(
          endYear,
          endMonth,
          0,
        ),
      );

    const start =
      new Date(
        Date.UTC(
          end.getUTCFullYear(),
          end.getUTCMonth() -
            (months - 1),
          1,
        ),
      );

    return {
      startDate:
        this.formatDateUtc(start),

      endDate:
        this.formatDateUtc(end),

      timeUnit:
        'month' as const,
    };
  }

  private async sleep(ms: number) {
    await new Promise<void>(
      (resolve) =>
        setTimeout(resolve, ms),
    );
  }

  private chunk<T>(
    values: T[],
    size: number,
  ): T[][] {
    const result: T[][] = [];

    for (
      let i = 0;
      i < values.length;
      i += size
    ) {
      result.push(
        values.slice(i, i + size),
      );
    }

    return result;
  }

  private async request(
    body: Record<string, unknown>,
  ): Promise<NaverTrendResponse> {
    const {
      clientId,
      clientSecret,
    } = this.getCredentials();

    const maxAttempts = 3;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {
      const response =
        await fetch(
          this.baseUrl,
          {
            method: 'POST',

            headers: {
              'X-NCP-APIGW-API-KEY-ID':
                clientId,

              'X-NCP-APIGW-API-KEY':
                clientSecret,

              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify(body),
          },
        );

      const text =
        await response.text();

      if (
        response.status === 429 &&
        attempt < maxAttempts
      ) {
        console.warn(
          `[Naver DataLab] 429 received. Retry ${attempt}/${maxAttempts}`,
        );

        await this.sleep(1500);

        continue;
      }

      if (!response.ok) {
        throw new Error(
          `Naver DataLab request failed: ${response.status} ${response.statusText}\n${text}`,
        );
      }

      return JSON.parse(
        text,
      ) as NaverTrendResponse;
    }

    throw new Error(
      'Naver DataLab request failed after retries',
    );
  }

  private async getNaverSource() {
    const source =
      await this.prisma.externalSource.findUnique({
        where: {
          code: 'NAVER_DATALAB',
        },
      });

    if (!source) {
      throw new Error(
        'NAVER_DATALAB does not exist in external_sources',
      );
    }

    return source;
  }

  async prepareTourPlaceSearchTrends(
    endYm?: string,
    limit?: number,
    onlySearchTermIds?: bigint[],
  ): Promise<PreparedNaverTrendSync> {
    const referenceTerm =
      this.getReferenceTerm();

    const source =
      await this.getNaverSource();

    const {
      startDate,
      endDate,
      timeUnit,
    } =
      this.getDateRange(
        endYm,
      );

    const allTerms =
      await this.prisma.naverSearchTerm.findMany({
        where: {
          isActive: true,

          place: {
            externalIds: {
              some: {
                idType:
                  'CONTENT_ID',

                source: {
                  code:
                    'TOUR_API',
                },
              },
            },
          },
        },

        select: {
          id: true,
          placeId: true,
          searchTerm: true,
        },

        orderBy: {
          id: 'asc',
        },
      });

    let targets = allTerms;

    if (
      onlySearchTermIds &&
      onlySearchTermIds.length > 0
    ) {
      const allowedIds =
        new Set(
          onlySearchTermIds.map(
            (id) =>
              id.toString(),
          ),
        );

      targets =
        allTerms.filter(
          (term) =>
            allowedIds.has(
              term.id.toString(),
            ),
        );
    } else if (
      limit &&
      limit > 0
    ) {
      targets =
        allTerms.slice(
          0,
          limit,
        );
    }

    if (targets.length === 0) {
      throw new Error(
        'No active Naver search terms found.',
      );
    }

    const termBatches =
      this.chunk(
        targets,
        4,
      );

    const preparedBatches:
      PreparedNaverBatch[] = [];

    let expectedInterestCount = 0;

    for (
      let batchIndex = 0;
      batchIndex <
      termBatches.length;
      batchIndex++
    ) {
      const batch =
        termBatches[
          batchIndex
        ];

      const keywordGroups = [
        {
          groupName:
            'REFERENCE',

          keywords: [
            referenceTerm,
          ],
        },

        ...batch.map(
          (term) => ({
            groupName:
              `PLACE_${term.id.toString()}`,

            keywords: [
              term.searchTerm,
            ],
          }),
        ),
      ];

      const requestPayload = {
        startDate,
        endDate,
        timeUnit,
        keywordGroups,
      };

      const response =
        await this.request(
          requestPayload,
        );

      const results =
        response.results ?? [];

      const referenceResult =
        results.find(
          (result) =>
            result.title ===
            'REFERENCE',
        );

      if (!referenceResult) {
        throw new Error(
          `Naver DataLab batch ${batchIndex + 1} does not contain REFERENCE result.`,
        );
      }

      const expectedPlaceTitles =
        new Set(
          batch.map(
            (term) =>
              `PLACE_${term.id.toString()}`,
          ),
        );

      for (
        const expectedTitle
        of expectedPlaceTitles
      ) {
        const exists =
          results.some(
            (result) =>
              result.title ===
              expectedTitle,
          );

        if (!exists) {
          throw new Error(
            `Naver DataLab batch ${batchIndex + 1} is missing result ${expectedTitle}.`,
          );
        }
      }

      for (
        const result
        of results
      ) {
        if (
          result.title ===
          'REFERENCE'
        ) {
          continue;
        }

        if (
          !expectedPlaceTitles.has(
            result.title,
          )
        ) {
          throw new Error(
            `Naver DataLab batch ${batchIndex + 1} returned unknown group title: ${result.title}`,
          );
        }

        expectedInterestCount +=
          result.data?.length ??
          0;
      }

      preparedBatches.push({
        batchIndex:
          batchIndex + 1,

        requestPayload,
        response,
      });

      await this.sleep(100);
    }

    if (
      preparedBatches.length !==
      termBatches.length
    ) {
      throw new Error(
        `Prepared Naver batch validation failed: ${preparedBatches.length}/${termBatches.length}`,
      );
    }

    return {
      sourceId:
        source.id,

      referenceTerm,

      startDate,
      endDate,
      timeUnit,

      targets,

      batches:
        preparedBatches,

      expectedInterestCount,
    };
  }

  async applyPreparedTourPlaceSearchTrends(
    prepared:
      PreparedNaverTrendSync,
    tx: any,
  ) {
    const startDate =
      new Date(
        `${prepared.startDate}T00:00:00.000Z`,
      );

    const endDate =
      new Date(
        `${prepared.endDate}T00:00:00.000Z`,
      );

    const targetIds =
      prepared.targets.map(
        (target) =>
          target.id,
      );

    /*
    * normalized 데이터만 해당 window에 대해 교체한다.
    *
    * 기존 RAW는 provenance/history이므로 삭제하지 않는다.
    *
    * transaction 실패 시 이 DELETE도 rollback된다.
    */
    await tx.naverSearchInterest.deleteMany({
      where: {
        naverSearchTermId: {
          in:
            targetIds,
        },

        periodStart: {
          gte:
            startDate,

          lte:
            endDate,
        },
      },
    });

    let rawInsertedCount = 0;
    let interestInsertedCount = 0;

    for (
      const preparedBatch
      of prepared.batches
    ) {
      const raw =
        await tx.rawNaverDatalabApi.create({
          data: {
            sourceId:
              prepared.sourceId,

            startDate,

            endDate,

            timeUnit:
              prepared.timeUnit,

            requestPayload:
              preparedBatch.requestPayload,

            responsePayload:
              preparedBatch.response,
          },
        });

      rawInsertedCount++;

      const interestRows: Array<{
        rawNaverDatalabId: bigint;
        naverSearchTermId: bigint;
        periodStart: Date;
        ratio: number;
      }> = [];

      for (
        const result
        of preparedBatch.response
          .results ?? []
      ) {
        if (
          result.title ===
          'REFERENCE'
        ) {
          continue;
        }

        const match =
          /^PLACE_(\d+)$/.exec(
            result.title,
          );

        if (!match) {
          throw new Error(
            `Unknown Naver DataLab group title during apply: ${result.title}`,
          );
        }

        const searchTermId =
          BigInt(
            match[1],
          );

        for (
          const point
          of result.data ?? []
        ) {
          interestRows.push({
            rawNaverDatalabId:
              raw.id,

            naverSearchTermId:
              searchTermId,

            periodStart:
              new Date(
                `${point.period}T00:00:00.000Z`,
              ),

            ratio:
              point.ratio,
          });
        }
      }

      if (
        interestRows.length >
        0
      ) {
        const created =
          await tx.naverSearchInterest.createMany({
            data:
              interestRows,
          });

        interestInsertedCount +=
          created.count;
      }
    }

    if (
      interestInsertedCount !==
      prepared.expectedInterestCount
    ) {
      throw new Error(
        `Naver interest insert validation failed: ` +
          `${interestInsertedCount}/${prepared.expectedInterestCount}`,
      );
    }

    const committedInterestCount =
      await tx.naverSearchInterest.count({
        where: {
          naverSearchTermId: {
            in:
              targetIds,
          },

          periodStart: {
            gte:
              startDate,

            lte:
              endDate,
          },
        },
      });

    if (
      committedInterestCount !==
      prepared.expectedInterestCount
    ) {
      throw new Error(
        `Naver DB validation failed: ` +
          `${committedInterestCount}/${prepared.expectedInterestCount}`,
      );
    }

    return {
      referenceTerm:
        prepared.referenceTerm,

      startDate:
        prepared.startDate,

      endDate:
        prepared.endDate,

      timeUnit:
        prepared.timeUnit,

      targetCount:
        prepared.targets.length,

      batchCount:
        prepared.batches.length,

      rawInsertedCount,

      interestInsertedCount,

      validation: {
        actual:
          committedInterestCount,

        expected:
          prepared.expectedInterestCount,
      },
    };
  }

  async syncTourPlaceSearchTrends(
    limit?: number,
    onlySearchTermIds?: bigint[],
    endYm?: string,
  ) {
    const prepared =
      await this.prepareTourPlaceSearchTrends(
        endYm,
        limit,
        onlySearchTermIds,
      );

    return this.prisma.$transaction(
      async (tx) =>
        this.applyPreparedTourPlaceSearchTrends(
          prepared,
          tx,
        ),
      {
        maxWait:
          10_000,

        timeout:
          30_000,
      },
    );
  }
}