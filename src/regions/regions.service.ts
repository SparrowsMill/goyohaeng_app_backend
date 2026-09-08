import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface RegionResponse {
  id: number;
  parentId: number | null;
  regionType: string;
  name: string;
}

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<RegionResponse[]> {
    const regions = await this.prisma.region.findMany({
      select: {
        id: true,
        parentId: true,
        regionType: true,
        name: true,
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
      regionType: region.regionType,
      name: region.name,
    }));
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