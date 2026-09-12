import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service';

@Injectable()
export class BusinessNaverAnalyticsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async getNaverAnalytics(
    placeId: number,
  ) {
    const place =
      await this.prisma.place.findUnique({
        where: {
          id: BigInt(placeId),
        },

        select: {
          id: true,
          name: true,

          naverSearchTerms: {
            where: {
              isActive: true,
            },

            orderBy: [
              {
                version: 'desc',
              },
              {
                id: 'desc',
              },
            ],

            take: 1,

            select: {
              id: true,
              searchTerm: true,
              version: true,
              createdAt: true,
              updatedAt: true,

              interest: {
                orderBy: {
                  periodStart:
                    'desc',
                },

                take: 30,

                select: {
                  periodStart: true,
                  ratio: true,
                },
              },
            },
          },
        },
      });

    if (!place) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    const searchTerm =
      place.naverSearchTerms[0] ??
      null;

    /*
     * 아직 네이버 검색어가
     * 등록되지 않은 장소
     */
    if (!searchTerm) {
      return {
        placeId:
          Number(place.id),

        placeName:
          place.name,

        available: false,

        searchTerm: null,
        searchTermVersion: null,

        latestInterest: null,
        previousInterest: null,

        difference: null,
        direction: null,

        history: [],
      };
    }

    /*
     * DB에서는 최신 날짜순으로
     * 가져온 상태
     */
    const interest =
      searchTerm.interest;

    const latest =
      interest[0] ?? null;

    const previous =
      interest[1] ?? null;

    const latestRatio =
      latest
        ? Number(latest.ratio)
        : null;

    const previousRatio =
      previous
        ? Number(previous.ratio)
        : null;

    let difference:
      number | null = null;

    let direction:
      'UP' |
      'DOWN' |
      'SAME' |
      null = null;

    if (
      latestRatio !== null &&
      previousRatio !== null
    ) {
      difference =
        Number(
          (
            latestRatio -
            previousRatio
          ).toFixed(6),
        );

      if (difference > 0) {
        direction = 'UP';
      } else if (
        difference < 0
      ) {
        direction = 'DOWN';
      } else {
        direction = 'SAME';
      }
    }

    /*
     * 프론트 차트에서는
     * 과거 → 최신 순서가
     * 사용하기 편하므로 reverse.
     */
    const history =
      [...interest]
        .reverse()
        .map(
          (item) => ({
            periodStart:
              item.periodStart,

            ratio:
              Number(
                item.ratio,
              ),
          }),
        );

    return {
      placeId:
        Number(place.id),

      placeName:
        place.name,

      available:
        interest.length > 0,

      searchTerm:
        searchTerm.searchTerm,

      searchTermVersion:
        searchTerm.version,

      searchTermUpdatedAt:
        searchTerm.updatedAt ??
        searchTerm.createdAt,

      latestInterest:
        latest
          ? {
              periodStart:
                latest.periodStart,

              ratio:
                latestRatio,
            }
          : null,

      previousInterest:
        previous
          ? {
              periodStart:
                previous.periodStart,

              ratio:
                previousRatio,
            }
          : null,

      difference,

      direction,

      history,
    };
  }
}