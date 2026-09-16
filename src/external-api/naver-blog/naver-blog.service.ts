import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

type BlogTarget = {
  placeId: bigint;
  placeName: string;
  searchTerm: string;
  historicallyEmpty: boolean;
};

type BlogApiItem = {
  title?: string;
  description?: string;
  link?: string;
  bloggername?: string;
  bloggerlink?: string;
  postdate?: string;
};

type PreparedBlogPlace = {
  target: BlogTarget;
  query: string;
  usedFallback: boolean;
  items: BlogApiItem[];
};

@Injectable()
export class NaverBlogService {
  private readonly baseUrl =
    'https://naverapihub.apigw.ntruss.com/search/v1/blog';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getCredentials() {
    const clientId =
      this.configService.get<string>(
        'NAVER_API_CLIENT_ID',
      );

    const clientSecret =
      this.configService.get<string>(
        'NAVER_API_CLIENT_SECRET',
      );

    if (
      !clientId ||
      !clientSecret
    ) {
      throw new Error(
        'NAVER_API_CLIENT_ID / NAVER_API_CLIENT_SECRET are not defined',
      );
    }

    return {
      clientId,
      clientSecret,
    };
  }

  private decodeHtmlEntities(
    value: string,
  ): string {
    return value
      .replace(
        /&#(\d+);/g,
        (_, code) =>
          String.fromCodePoint(
            Number(code),
          ),
      )
      .replace(
        /&#x([0-9a-f]+);/gi,
        (_, code) =>
          String.fromCodePoint(
            parseInt(code, 16),
          ),
      )
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>');
  }

  private cleanText(
    value?: string | null,
  ): string | null {
    if (!value) {
      return null;
    }

    const cleaned =
      this.decodeHtmlEntities(
        value.replace(
          /<[^>]+>/g,
          '',
        ),
      ).trim();

    return cleaned || null;
  }

  private makeFallbackQuery(
    value: string,
  ): string {
    return value
      .replace(
        /\[[^\]]+\]/g,
        ' ',
      )
      .replace(
        /\([^)]*\)/g,
        ' ',
      )
      .replace(/[·/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parsePostDate(
    value?: string,
  ): Date | null {
    if (
      !value ||
      !/^\d{8}$/.test(value)
    ) {
      return null;
    }

    const year =
      Number(
        value.slice(0, 4),
      );

    const month =
      Number(
        value.slice(4, 6),
      );

    const day =
      Number(
        value.slice(6, 8),
      );

    /*
     * Python 기존 collector의
     * Asia/Seoul 00:00과 동일:
     * UTC 기준 전날 15:00.
     */
    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        -9,
        0,
        0,
      ),
    );
  }

  private async request(
    query: string,
  ) {
    const {
      clientId,
      clientSecret,
    } =
      this.getCredentials();

    const params =
      new URLSearchParams({
        query,
        display:
          '5',
        start:
          '1',
        sort:
          'date',
        format:
          'json',
      });

    const response =
      await fetch(
        `${this.baseUrl}?${params.toString()}`,
        {
          method:
            'GET',

          headers: {
            'X-NCP-APIGW-API-KEY-ID':
              clientId,

            'X-NCP-APIGW-API-KEY':
              clientSecret,
          },
        },
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Naver Blog API failed: ` +
          `${response.status} ` +
          `${response.statusText}\n` +
          text.slice(
            0,
            1000,
          ),
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Naver Blog API returned non-JSON:\n` +
          text.slice(
            0,
            1000,
          ),
      );
    }
  }

  private async getTargets(
    limit?: number,
    onlyPlaceIds?: bigint[],
  ): Promise<BlogTarget[]> {
    const rows:
      Array<{
        placeId: bigint;
        placeName: string;
        searchTerm: string;
        blogCount: bigint;
      }> =
      await this.prisma.$queryRaw`
        SELECT
          p.id AS "placeId",
          p.name AS "placeName",
          nst.search_term AS "searchTerm",
          COUNT(pec.id)::bigint
            AS "blogCount"

        FROM naver_search_terms nst

        JOIN places p
          ON p.id =
             nst.place_id

        LEFT JOIN place_external_contents pec
          ON pec.place_id =
             p.id
         AND pec.content_type =
             'NAVER_BLOG'

        WHERE nst.is_active =
              TRUE

        GROUP BY
          p.id,
          p.name,
          nst.search_term

        ORDER BY
          p.id
      `;

    let targets =
      rows.map(
        (row) => ({
          placeId:
            row.placeId,

          placeName:
            row.placeName,

          searchTerm:
            row.searchTerm,

          historicallyEmpty:
            row.blogCount ===
            0n,
        }),
      );

    if (
      onlyPlaceIds &&
      onlyPlaceIds.length > 0
    ) {
      const allowed =
        new Set(
          onlyPlaceIds.map(
            (id) =>
              id.toString(),
          ),
        );

      targets =
        targets.filter(
          (target) =>
            allowed.has(
              target.placeId
                .toString(),
            ),
        );
    }

    if (
      limit &&
      limit > 0
    ) {
      return targets.slice(
        0,
        limit,
      );
    }

    return targets;
  }

  /**
   * 한 장소의 API 결과만 준비한다.
   *
   * 과거에도 Blog가 한 건도 없었고,
   * 기본 query 결과도 0이면
   * 기존 Python retry-empty와 같은
   * fallback query를 시도한다.
   *
   * DB mutation 없음.
   */
  private async preparePlace(
    target: BlogTarget,
  ): Promise<PreparedBlogPlace> {
    const primary =
      await this.request(
        target.searchTerm,
      );

    let items:
      BlogApiItem[] =
      Array.isArray(
        primary?.items,
      )
        ? primary.items
        : [];

    if (
      items.length > 0 ||
      !target.historicallyEmpty
    ) {
      return {
        target,
        query:
          target.searchTerm,
        usedFallback:
          false,
        items,
      };
    }

    const fallback =
      this.makeFallbackQuery(
        target.searchTerm,
      );

    if (
      !fallback ||
      fallback ===
        target.searchTerm
    ) {
      return {
        target,
        query:
          target.searchTerm,
        usedFallback:
          false,
        items,
      };
    }

    const fallbackResult =
      await this.request(
        fallback,
      );

    items =
      Array.isArray(
        fallbackResult?.items,
      )
        ? fallbackResult.items
        : [];

    return {
      target,
      query:
        fallback,
      usedFallback:
        true,
      items,
    };
  }

  private async trimOldBlogContents(
    tx: any,
    placeId: bigint,
    keepCount = 25,
  ) {
    const rows: Array<{
      id: bigint;
      issueReports: Array<{
        id: bigint;
      }>;
    }> =
      await tx.placeExternalContent.findMany({
        where: {
          placeId,
          contentType:
            'NAVER_BLOG',
        },

        orderBy: [
          {
            publishedAt: {
              sort: 'desc',
              nulls: 'last',
            },
          },
          {
            collectedAt:
              'desc',
          },
          {
            id:
              'desc',
          },
        ],

        select: {
          id: true,

          /*
           * 신고/이슈가 연결된 콘텐츠는
           * 자동 삭제하지 않는다.
           */
          issueReports: {
            select: {
              id: true,
            },
            take: 1,
          },
        },
      });

    if (
      rows.length <= keepCount
    ) {
      return {
        deletedCount: 0,
        protectedCount: 0,
      };
    }

    const oldRows =
      rows.slice(
        keepCount,
      );

    const removableIds =
      oldRows
        .filter(
          (row) =>
            row.issueReports
              .length === 0,
        )
        .map(
          (row) =>
            row.id,
        );

    const protectedCount =
      oldRows.length -
      removableIds.length;

    if (
      removableIds.length ===
      0
    ) {
      return {
        deletedCount: 0,
        protectedCount,
      };
    }

    const deleted =
      await tx.placeExternalContent.deleteMany({
        where: {
          id: {
            in:
              removableIds,
          },
        },
      });

    return {
      deletedCount:
        deleted.count,

      protectedCount,
    };
  }

  private async applyPlace(
    prepared: PreparedBlogPlace,
  ) {
    const now =
      new Date();

    let insertedCount =
      0;

    let skippedExistingCount =
      0;

    let deletedOldCount =
      0;

    let protectedOldCount =
      0;

    await this.prisma.$transaction(
      async (tx) => {
        for (
          const item
          of prepared.items
        ) {
          const url =
            typeof item.link ===
              'string'
              ? item.link.trim()
              : '';

          if (!url) {
            continue;
          }

          /*
           * 같은 장소 + 같은 URL이면
           * 기존 글로 간주하고 아무것도 갱신하지 않는다.
           */
          const existing =
            await tx.placeExternalContent.findUnique({
              where: {
                placeId_url: {
                  placeId:
                    prepared.target
                      .placeId,

                  url,
                },
              },

              select: {
                id: true,
              },
            });

          if (existing) {
            skippedExistingCount++;
            continue;
          }

          await tx.placeExternalContent.create({
            data: {
              placeId:
                prepared.target
                  .placeId,

              contentType:
                'NAVER_BLOG',

              title:
                this.cleanText(
                  item.title,
                ),

              description:
                this.cleanText(
                  item.description,
                ),

              url,

              author:
                this.cleanText(
                  item.bloggername,
                ),

              authorUrl:
                item.bloggerlink ??
                null,

              publishedAt:
                this.parsePostDate(
                  item.postdate,
                ),

              collectedAt:
                now,
            },
          });

          insertedCount++;
        }

        /*
         * 신규 삽입 후 해당 장소에
         * NAVER_BLOG가 25개보다 많다면
         * 오래된 글부터 정리한다.
         *
         * 단, PlaceIssueReport가 참조 중인 row는
         * 삭제하지 않는다.
         */
        const retention =
          await this.trimOldBlogContents(
            tx,
            prepared.target.placeId,
            25,
          );

        deletedOldCount =
          retention.deletedCount;

        protectedOldCount =
          retention.protectedCount;
      },
    );

    return {
      insertedCount,
      skippedExistingCount,
      deletedOldCount,
      protectedOldCount,
    };
  }

  /**
   * 전체 active search-term 장소를
   * 장소 단위로 수집/저장한다.
   *
   * 한 장소 실패가 다른 장소의
   * 성공 데이터를 롤백시키지 않는다.
   */
  async syncActivePlaces(
    limit?: number,
    onlyPlaceIds?: bigint[],
  ) {
    const targets =
      await this.getTargets(
        limit,
        onlyPlaceIds,
      );

    let successCount =
      0;

    let failedCount =
      0;

    let returnedItemCount =
      0;

    let insertedCount =
      0;

    let skippedExistingCount =
      0;

    let deletedOldCount =
      0;

    let protectedOldCount =
      0;

    let fallbackCount =
      0;

    let stillEmptyCount =
      0;

    const failures:
      Array<{
        placeId: string;
        searchTerm: string;
        error: string;
      }> = [];

    for (
      let index = 0;
      index <
      targets.length;
      index++
    ) {
      const target =
        targets[index];

      try {
        const prepared =
          await this.preparePlace(
            target,
          );

        if (
          prepared.usedFallback
        ) {
          fallbackCount++;
        }

        returnedItemCount +=
          prepared.items.length;

        if (
          prepared.items.length ===
            0 &&
          target.historicallyEmpty
        ) {
          stillEmptyCount++;
        }

        const applied =
          await this.applyPlace(
            prepared,
          );

        insertedCount +=
          applied.insertedCount;

        skippedExistingCount +=
          applied.skippedExistingCount;

        deletedOldCount +=
          applied.deletedOldCount;

        protectedOldCount +=
          applied.protectedOldCount;

        successCount++;
      } catch (error) {
        failedCount++;

        failures.push({
          placeId:
            target.placeId
              .toString(),

          searchTerm:
            target.searchTerm,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }

      /*
       * 기존 Python collector와 동일한
       * 0.1초 pacing.
       */
      if (
        index <
        targets.length - 1
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              100,
            ),
        );
      }
    }

    return {
      targetCount:
        targets.length,

      successCount,
      failedCount,

      returnedItemCount,
      insertedCount,
      skippedExistingCount,
      deletedOldCount,
      protectedOldCount,

      fallbackCount,
      stillEmptyCount,

      failures,
    };
  }
}