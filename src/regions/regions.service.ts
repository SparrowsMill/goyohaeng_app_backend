import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface RegionResponse {
  id: number;
  parentId: number | null;
  regionType: string;
  name: string;
  sgisCode: string | null;
}

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<RegionResponse[]> {
  const regions =
    await this.prisma.region.findMany({
      select: {
        id: true,
        parentId: true,
        regionType: true,
        name: true,

        externalCodes: {
          where: {
            codeType: 'SGIS_ADM_CD',

            source: {
              code: 'SGIS',
            },
          },

          select: {
            externalCode: true,
          },

          take: 1,
        },
      },

      orderBy: {
        id: 'asc',
      },
    });

  return regions.map((region) => ({
    id: Number(region.id),

    parentId:
      region.parentId === null
        ? null
        : Number(region.parentId),

    regionType:
      region.regionType,

    name:
      region.name,

    sgisCode:
      region.externalCodes[0]
        ?.externalCode ?? null,
  }));
}

  async getGapScores() {
  // 1. 실제 GAP Score가 존재하는 가장 최신 계산 회차 조회
  const latestRun =
  await this.prisma.gapScoreRun.findFirst({
    where: {
      formulaVersion: 'GAP_V1_PROXY',
      dataStage: 'COLD_START',

      scores: {
        some: {},
      },
    },

    orderBy: [
      {
        calculatedAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],

    select: {
      id: true,
      formulaVersion: true,
      dataStage: true,
      calculatedAt: true,
    },
  });

  // 아직 GAP Score 계산 결과가 없는 경우
  if (!latestRun) {
    return {
      run: null,
      items: [],
      total: 0,
    };
  }

  // 2. 최신 run의 모든 장소 GAP Score 조회
  const scores =
    await this.prisma.gapScoreHistory.findMany({
      where: {
        runId: latestRun.id,

        place: {
          status: 'ACTIVE',

          districtRegionId: {
            not: null,
          },
        },
      },

      select: {
        gapScore: true,

        place: {
          select: {
            districtRegionId: true,
          },
        },
      },
    });

  /*
   * 3. 지역별 합계와 장소 수 계산
   *
   * regionId -> {
   *   sum: GAP Score 총합,
   *   count: GAP Score가 존재하는 장소 수
   * }
   */
  const regionStats =
    new Map<
      string,
      {
        regionId: bigint;
        sum: number;
        count: number;
      }
    >();

  for (const score of scores) {
    const regionId =
      score.place.districtRegionId;

    if (regionId === null) {
      continue;
    }

    const key =
      regionId.toString();

    const current =
      regionStats.get(key);

    if (current) {
      current.sum +=
        Number(score.gapScore);

      current.count += 1;
    } else {
      regionStats.set(key, {
        regionId,
        sum: Number(score.gapScore),
        count: 1,
      });
    }
  }

  // 4. 평균이 계산된 지역 ID 목록
  const regionIds =
    Array.from(
      regionStats.values(),
    ).map(
      (stat) =>
        stat.regionId,
    );

  // GAP Score가 있는 지역 자체가 없는 경우
  if (regionIds.length === 0) {
    return {
      run: {
        id:
          Number(latestRun.id),

        formulaVersion:
          latestRun.formulaVersion,

        dataStage:
          latestRun.dataStage,

        calculatedAt:
          latestRun.calculatedAt,
      },

      items: [],
      total: 0,
    };
  }

  // 5. 지역 정보 조회
  const regions =
  await this.prisma.region.findMany({
    where: {
      id: {
        in: regionIds,
      },
    },

    select: {
      id: true,
      parentId: true,
      regionType: true,
      name: true,

      externalCodes: {
        where: {
          codeType: 'SGIS_ADM_CD',

          source: {
            code: 'SGIS',
          },
        },

        select: {
          externalCode: true,
        },

        take: 1,
      },
    },
  });

  // 6. 지역 GAP Score 평균 생성
  const items =
    regions
      .map((region) => {
        const stat =
          regionStats.get(
            region.id.toString(),
          );

        if (!stat) {
          return null;
        }

        const averageGapScore =
          stat.sum /
          stat.count;

        return {
          regionId:
            Number(region.id),

          parentId:
            region.parentId === null
              ? null
              : Number(
                  region.parentId,
                ),

          regionType:
            region.regionType,

          regionName:
            region.name,

          sgisCode:
            region.externalCodes[0]
            ?.externalCode ?? null,


          gapScore:
            Number(
              averageGapScore.toFixed(
                4,
              ),
            ),

          placeCount:
            stat.count,
        };
      })
      .filter(
        (
          item,
        ): item is NonNullable<
          typeof item
        > =>
          item !== null,
      )
      .sort(
        (a, b) =>
          b.gapScore -
          a.gapScore,
      );

  return {
    run: {
      id:
        Number(latestRun.id),

      formulaVersion:
        latestRun.formulaVersion,

      dataStage:
        latestRun.dataStage,

      calculatedAt:
        latestRun.calculatedAt,
    },

    items,

    total:
      items.length,
  };
}

  async getSpotCounts(regionId: number) {
  const region = await this.prisma.region.findUnique({
    where: {
      id: BigInt(regionId),
    },
    select: {
      id: true,
      name: true,
      regionType: true,
      children: {
        select: {
          id: true,
          name: true,
          regionType: true,
        },
      },
    },
  });

  if (!region) {
    return undefined;
  }

  /*
   * PROVINCE인 경우:
   * 서울특별시 아래 DISTRICT들의 장소 수를 집계
   */
  if (region.regionType === 'PROVINCE') {
    const districts = region.children.filter(
      (child) => child.regionType === 'DISTRICT',
    );

    const districtIds = districts.map(
      (district) => district.id,
    );

    const counts =
      districtIds.length === 0
        ? []
        : await this.prisma.place.groupBy({
            by: ['districtRegionId'],

            where: {
              status: 'ACTIVE',

              districtRegionId: {
                in: districtIds,
              },
            },

            _count: {
              _all: true,
            },
          });

    const countMap = new Map(
      counts.map((count) => [
        count.districtRegionId?.toString(),
        count._count._all,
      ]),
    );

    const children = districts.map(
      (district) => ({
        regionId: Number(district.id),
        regionName: district.name,
        spotCount:
          countMap.get(
            district.id.toString(),
          ) ?? 0,
      }),
    );

    const spotCount = children.reduce(
      (sum, district) =>
        sum + district.spotCount,
      0,
    );

    return {
      regionId: Number(region.id),
      regionName: region.name,
      spotCount,
      children,
    };
  }

  /*
   * DISTRICT인 경우:
   * 해당 구의 장소 수만 집계
   */
  const spotCount =
    await this.prisma.place.count({
      where: {
        status: 'ACTIVE',
        districtRegionId: region.id,
      },
    });

  return {
    regionId: Number(region.id),
    regionName: region.name,
    spotCount,
    children: [],
  };
}


}