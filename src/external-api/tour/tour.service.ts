import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TourService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B551011/KorService2';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getServiceKey(): string {
    const serviceKey =
      this.configService.get<string>('PUBLIC_DATA_SERVICE_KEY');

    if (!serviceKey) {
      throw new Error('PUBLIC_DATA_SERVICE_KEY is not defined');
    }

    return serviceKey;
  }

  /**
   * TourAPI 공통 GET 요청
   */
  private async request(
    endpoint: string,
    params: Record<string, string | number> = {},
  ) {
    const serviceKey = this.getServiceKey();

    const queryParams = new URLSearchParams();

    queryParams.set('MobileOS', 'ETC');
    queryParams.set('MobileApp', 'Goyohaeng');
    queryParams.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      queryParams.set(key, String(value));
    }

    const url =
      `${this.baseUrl}/${endpoint}` +
      `?serviceKey=${serviceKey}&${queryParams.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `TourAPI request failed: ${response.status} ${response.statusText}\n${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`TourAPI returned non-JSON response:\n${text}`);
    }
  }

  /**
   * TourAPI source row 가져오기
   */
  private async getTourApiSource() {
    const source = await this.prisma.externalSource.findUnique({
      where: {
        code: 'TOUR_API',
      },
    });

    if (!source) {
      throw new Error(
        'TOUR_API does not exist in external_sources',
      );
    }

    return source;
  }

  /**
   * TourAPI 지역코드 조회
   *
   * 우선 전국 시/도 목록을 조회한다.
   */
  async fetchAreaCodes() {
    const data = await this.request('areaCode2', {
      numOfRows: 100,
      pageNo: 1,
    });

    const source = await this.getTourApiSource();

    await this.prisma.rawTourApi.create({
      data: {
        sourceId: source.id,
        endpoint: 'areaCode2',

        requestPayload: {
          numOfRows: 100,
          pageNo: 1,
          MobileOS: 'ETC',
          MobileApp: 'Goyohaeng',
          _type: 'json',
        },

        responsePayload: data,
      },
    });

    return data;
  }

  /**
   * 전국 시/도 중 서울특별시만 찾는다.
   */
  async fetchSeoulAreaCode() {
    const data = await this.fetchAreaCodes();

    const items = this.extractItems(data);

    const seoul = items.find(
      (item) => item.name === '서울' || item.name === '서울특별시',
    );

    if (!seoul) {
      throw new Error(
        '서울특별시를 TourAPI areaCode2 응답에서 찾지 못했습니다.',
      );
    }

    return seoul;
  }

  /**
   * TourAPI 법정동 코드 조회
   *
   * lDongRegnCd가 주어지면 해당 시도의 시군구 조회
   */
  async fetchLegalDistrictCodes(lDongRegnCd?: string) {
    const params: Record<string, string | number> = {
      numOfRows: 100,
      pageNo: 1,
    };

    if (lDongRegnCd) {
      params.lDongRegnCd = lDongRegnCd;
    }

    const data = await this.request('ldongCode2', params);

    const source = await this.getTourApiSource();

    await this.prisma.rawTourApi.create({
      data: {
        sourceId: source.id,
        endpoint: 'ldongCode2',

        requestPayload: {
          ...params,
          MobileOS: 'ETC',
          MobileApp: 'Goyohaeng',
          _type: 'json',
        },

        responsePayload: data,
      },
    });

    return data;
  }

  /**
   * API response 안의 item 배열을 안전하게 꺼낸다.
   */
  private extractItems(data: any): any[] {
    const item = data?.response?.body?.items?.item;

    if (!item) {
      return [];
    }

    return Array.isArray(item) ? item : [item];
  }

  // 서울 자치구 코드 조회 + raw_tour_api 원본 저장  
  async fetchSeoulDistrictCodes() {
    const data = await this.request('areaCode2', {
      areaCode: '1',
      numOfRows: 100,
      pageNo: 1,
    });

    const source = await this.getTourApiSource();

    await this.prisma.rawTourApi.create({
      data: {
        sourceId: source.id,
        endpoint: 'areaCode2',
        requestPayload: {
          areaCode: '1',
          numOfRows: 100,
          pageNo: 1,
          MobileOS: 'ETC',
          MobileApp: 'Goyohaeng',
          _type: 'json',
        },
        responsePayload: data,
      },
    });

    return this.extractItems(data);
  }

  
  /**
   * 서울특별시 + 25개 자치구의 TourAPI 지역 코드를
   * region_external_codes에 저장
   */
  async syncSeoulRegionCodes() {
    const source = await this.getTourApiSource();

    // 1. 우리 DB의 서울특별시 조회
    const seoulRegion = await this.prisma.region.findFirst({
      where: {
        parentId: null,
        regionType: 'PROVINCE',
        name: '서울특별시',
      },
    });

    if (!seoulRegion) {
      throw new Error('regions 테이블에서 서울특별시를 찾지 못했습니다.');
    }

    // 2. TourAPI 서울 areaCode 조회
    const seoulApi = await this.fetchSeoulAreaCode();

    await this.prisma.regionExternalCode.upsert({
      where: {
        sourceId_codeType_externalCode: {
          sourceId: source.id,
          codeType: 'AREA_CODE',
          externalCode: String(seoulApi.code),
        },
      },
      update: {
        regionId: seoulRegion.id,
        externalName: seoulApi.name,
      },
      create: {
        regionId: seoulRegion.id,
        sourceId: source.id,
        codeType: 'AREA_CODE',
        externalCode: String(seoulApi.code),
        externalName: seoulApi.name,
      },
    });

    // 3. TourAPI 서울 자치구 코드 조회
    const districtApis = await this.fetchSeoulDistrictCodes();

    if (districtApis.length !== 25) {
      throw new Error(
        `TourAPI 서울 자치구가 25개가 아닙니다. 실제 개수: ${districtApis.length}`,
      );
    }

    const savedDistricts = [];

    // 4. API 자치구 ↔ 우리 regions 매칭 후 저장
    for (const districtApi of districtApis) {
      const districtRegion = await this.prisma.region.findFirst({
        where: {
          parentId: seoulRegion.id,
          regionType: 'DISTRICT',
          name: districtApi.name,
        },
      });

      if (!districtRegion) {
        throw new Error(
          `regions 테이블에서 자치구를 찾지 못했습니다: ${districtApi.name}`,
        );
      }

      const saved = await this.prisma.regionExternalCode.upsert({
        where: {
          sourceId_codeType_externalCode: {
            sourceId: source.id,
            codeType: 'SIGUNGU_CODE',
            externalCode: String(districtApi.code),
          },
        },
        update: {
          regionId: districtRegion.id,
          externalName: districtApi.name,
        },
        create: {
          regionId: districtRegion.id,
          sourceId: source.id,
          codeType: 'SIGUNGU_CODE',
          externalCode: String(districtApi.code),
          externalName: districtApi.name,
        },
      });

      savedDistricts.push({
        regionId: saved.regionId.toString(),
        name: districtApi.name,
        code: districtApi.code,
      });
    }

    return {
      source: 'TOUR_API',
      seoul: {
        regionId: seoulRegion.id.toString(),
        name: seoulRegion.name,
        areaCode: String(seoulApi.code),
      },
      districtCount: savedDistricts.length,
      districts: savedDistricts,
    };
  }

  /**
   * 서울 관광정보 1페이지 조회 후 raw_tour_api에 저장
   */
  async fetchSeoulPlacesFirstPage() {
    const source = await this.getTourApiSource();

    const params = {
      areaCode: '1',
      numOfRows: 100,
      pageNo: 1,
    };

    const data = await this.request('areaBasedList2', params);

    const items = this.extractItems(data);

    if (items.length === 0) {
      throw new Error(
        'TourAPI areaBasedList2에서 서울 관광정보를 가져오지 못했습니다.',
      );
    }

    for (const item of items) {
      await this.prisma.rawTourApi.create({
        data: {
          sourceId: source.id,
          endpoint: 'areaBasedList2',

          contentId: item.contentid
            ? String(item.contentid)
            : null,

          contentTypeId: item.contenttypeid
            ? String(item.contenttypeid)
            : null,

          requestPayload: params,

          responsePayload: item,
        },
      });
    }

    return {
      areaCode: '1',
      pageNo: 1,
      requestedRows: 100,
      savedCount: items.length,
      totalCount: data?.response?.body?.totalCount ?? null,
    };
  }
  private parseTourDateTime(value?: string): Date | null {
    if (!value || !/^\d{14}$/.test(value)) {
      return null;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(8, 10));
    const minute = Number(value.slice(10, 12));
    const second = Number(value.slice(12, 14));

    return new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second,
      ),
    );
  }
  async syncAllSeoulPlaces() {
    const source = await this.getTourApiSource();

    const numOfRows = 100;

    let pageNo = 1;
    let totalCount = 0;
    let totalPages = 0;

    let fetchedCount = 0;
    let insertedCount = 0;
    let skippedCount = 0;

    do {
      const params = {
        areaCode: '1',
        numOfRows,
        pageNo,
      };

      const data = await this.request(
        'areaBasedList2',
        params,
      );

      const items = this.extractItems(data);

      if (pageNo === 1) {
        totalCount =
          Number(data?.response?.body?.totalCount ?? 0);

        totalPages = Math.ceil(
          totalCount / numOfRows,
        );
      }

      for (const item of items) {
        fetchedCount++;

        const contentId = item.contentid
          ? String(item.contentid)
          : null;

        const contentTypeId = item.contenttypeid
          ? String(item.contenttypeid)
          : null;

        const sourceModifiedAt =
          this.parseTourDateTime(
            item.modifiedtime
              ? String(item.modifiedtime)
              : undefined,
          );

        if (contentId) {
          const existing =
            await this.prisma.rawTourApi.findFirst({
              where: {
                sourceId: source.id,
                endpoint: 'areaBasedList2',
                contentId,
              },
              orderBy: {
                fetchedAt: 'desc',
              },
            });

          if (
            existing &&
            existing.sourceModifiedAt &&
            sourceModifiedAt &&
            existing.sourceModifiedAt.getTime() ===
              sourceModifiedAt.getTime()
          ) {
            skippedCount++;
            continue;
          }
        }

        await this.prisma.rawTourApi.create({
          data: {
            sourceId: source.id,
            endpoint: 'areaBasedList2',
            contentId,
            contentTypeId,
            requestPayload: params,
            responsePayload: item,
            sourceModifiedAt,
          },
        });

        insertedCount++;
      }

      console.log(
        `[TourAPI] Seoul page ${pageNo}/${totalPages} - ${items.length} items`,
      );

      pageNo++;
    } while (pageNo <= totalPages);

    return {
      areaCode: '1',
      totalCount,
      totalPages,
      fetchedCount,
      insertedCount,
      skippedCount,
    };
  }
}