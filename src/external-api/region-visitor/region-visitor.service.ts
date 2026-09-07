import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RegionVisitorService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B551011/DataLabService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 공공데이터포털 인증키
   */
  private getServiceKey(): string {
    const serviceKey =
      this.configService.get<string>('PUBLIC_DATA_SERVICE_KEY');

    if (!serviceKey) {
      throw new Error(
        'PUBLIC_DATA_SERVICE_KEY is not defined',
      );
    }

    return serviceKey;
  }

  /**
   * external_sources의 REGION_VISITOR_API
   */
  private async getSource() {
    const source =
      await this.prisma.externalSource.findUnique({
        where: {
          code: 'REGION_VISITOR_API',
        },
      });

    if (!source) {
      throw new Error(
        'REGION_VISITOR_API does not exist in external_sources',
      );
    }

    return source;
  }

  /**
   * 공통 API 요청
   */
  private async request(
    endpoint: string,
    params: Record<string, string | number>,
  ) {
    const serviceKey = this.getServiceKey();

    const queryParams = new URLSearchParams();

    queryParams.set('MobileOS', 'ETC');
    queryParams.set('MobileApp', 'Goyohaeng');
    queryParams.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      queryParams.set(key, String(value));
    }

    /*
     * 이전 TourAPI와 동일하게
     * serviceKey 자체는 다시 URL encoding하지 않는다.
     */
    const url =
      `${this.baseUrl}/${endpoint}` +
      `?serviceKey=${serviceKey}` +
      `&${queryParams.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Region Visitor API request failed: ` +
          `${response.status} ${response.statusText}\n${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Region Visitor API returned non-JSON response:\n${text}`,
      );
    }
  }

  /**
   * response.body.items.item 추출
   */
  private extractItems(data: any): any[] {
    const item =
      data?.response?.body?.items?.item;

    if (!item) {
      return [];
    }

    return Array.isArray(item)
      ? item
      : [item];
  }

  /**
   * YYYYMMDD -> Date
   */
  private parseBaseDate(
    value?: string,
  ): Date | null {
    if (!value || !/^\d{8}$/.test(value)) {
      return null;
    }

    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));

    return new Date(
      Date.UTC(year, month - 1, day),
    );
  }

  /**
   * 서울 데이터 여부
   *
   * metcoRegnVisitrDDList:
   *   areaCd / areaNm 사용
   *
   * locgoRegnVisitrDDList:
   *   areaCd가 없고 signguCode만 존재
   *   서울 자치구 코드는 11로 시작
   */
  private isSeoulItem(item: any): boolean {
    const areaCode = String(
      item.areaCd ??
        item.areaCode ??
        '',
    );

    const areaName = String(
      item.areaNm ??
        item.areaName ??
        '',
    );

    const signguCode = String(
      item.signguCode ??
        item.signguCd ??
        '',
    );

    return (
      areaCode === '11' ||
      areaName === '서울' ||
      areaName === '서울특별시' ||
      signguCode.startsWith('11')
    );
  }
  
  /**
   * 하나의 endpoint를 모든 페이지 조회하여
   * 서울 데이터만 반환
   */
  private async fetchAllPages(
    endpoint: string,
    startYmd: string,
    endYmd: string,
  ) {
    const numOfRows = 1000;

    let pageNo = 1;
    let fetchedRawCount = 0;
    let totalCount = 0;

    const seoulItems: any[] = [];

    while (true) {
      const params = {
        numOfRows,
        pageNo,
        startYmd,
        endYmd,
      };

      const data = await this.request(
        endpoint,
        params,
      );

      const items =
        this.extractItems(data);

      if (pageNo === 1) {
        totalCount = Number(
          data?.response?.body?.totalCount ?? 0,
        );
      }

      if (items.length === 0) {
        break;
      }

      fetchedRawCount += items.length;

      for (const item of items) {
        if (this.isSeoulItem(item)) {
          seoulItems.push(item);
        }
      }

      console.log(
        `[RegionVisitor] ${endpoint} ` +
          `page ${pageNo} - ` +
          `${items.length} raw / ` +
          `${seoulItems.length} Seoul accumulated`,
      );

      if (
        totalCount > 0 &&
        fetchedRawCount >= totalCount
      ) {
        break;
      }

      pageNo++;
    }

    return {
      endpoint,
      totalCount,
      fetchedRawCount,
      seoulItems,
    };
  }

  async countSeoulVisitorData(
    startYmd: string,
    endYmd: string,
  ) {
    if (
      !/^\d{8}$/.test(startYmd) ||
      !/^\d{8}$/.test(endYmd)
    ) {
      throw new Error(
        'startYmd/endYmd must be YYYYMMDD',
      );
    }

    const metro =
      await this.fetchAllPages(
        'metcoRegnVisitrDDList',
        startYmd,
        endYmd,
      );

    const local =
      await this.fetchAllPages(
        'locgoRegnVisitrDDList',
        startYmd,
        endYmd,
      );

    return {
      startYmd,
      endYmd,

      metro: {
        apiTotalCount: metro.totalCount,
        fetchedRawCount: metro.fetchedRawCount,
        seoulCount: metro.seoulItems.length,
      },

      local: {
        apiTotalCount: local.totalCount,
        fetchedRawCount: local.fetchedRawCount,
        seoulCount: local.seoulItems.length,
      },

      totalSeoulCount:
        metro.seoulItems.length +
        local.seoulItems.length,
    };
  }

  /**
   * 서울 광역 + 자치구 방문자 데이터를
   * 지정 기간만큼 RAW 저장
   *
   * 같은 기간을 다시 실행하면
   * 해당 기간의 기존 RAW를 먼저 지우고 다시 저장.
   */
  async syncSeoulVisitorData(
    startYmd: string,
    endYmd: string,
  ) {
    if (
      !/^\d{8}$/.test(startYmd) ||
      !/^\d{8}$/.test(endYmd)
    ) {
      throw new Error(
        'startYmd/endYmd must be YYYYMMDD',
      );
    }

    if (startYmd > endYmd) {
      throw new Error(
        'startYmd must be <= endYmd',
      );
    }

    const source = await this.getSource();

    const startDate =
      this.parseBaseDate(startYmd);

    const endDate =
      this.parseBaseDate(endYmd);

    if (!startDate || !endDate) {
      throw new Error(
        'Invalid date range',
      );
    }

    /*
     * 동일 기간 재실행 시 중복 방지.
     */
    const deleted =
      await this.prisma.rawRegionVisitorApi.deleteMany({
        where: {
          sourceId: source.id,
          baseDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

    console.log(
      `[RegionVisitor] deleted previous rows: ${deleted.count}`,
    );

    /*
     * 1. 광역시/도
     */
    const metro =
      await this.fetchAllPages(
        'metcoRegnVisitrDDList',
        startYmd,
        endYmd,
      );

    /*
     * 2. 시군구
     */
    const local =
      await this.fetchAllPages(
        'locgoRegnVisitrDDList',
        startYmd,
        endYmd,
      );

    /*
     * 광역 데이터 RAW 저장
     */
    if (metro.seoulItems.length > 0) {
      await this.prisma.rawRegionVisitorApi.createMany({
        data: metro.seoulItems.map((item) => ({
          sourceId: source.id,

          endpoint:
            'metcoRegnVisitrDDList',

          areaCode: String(
            item.areaCd ??
              item.areaCode ??
              '',
          ) || null,

          signguCode: null,

          baseDate:
            this.parseBaseDate(
              String(item.baseYmd ?? ''),
            ),

          requestPayload: {
            startYmd,
            endYmd,
          },

          responsePayload: item,
        })),
      });
    }

    /*
     * 자치구 데이터 RAW 저장
     */
    if (local.seoulItems.length > 0) {
      await this.prisma.rawRegionVisitorApi.createMany({
        data: local.seoulItems.map((item) => ({
          sourceId: source.id,

          endpoint:
            'locgoRegnVisitrDDList',

          areaCode: String(
            item.areaCd ??
              item.areaCode ??
              '',
          ) || null,

          /*
           * 이 API의 시군구 필드는 signguCode.
           */
          signguCode: String(
            item.signguCode ??
              item.signguCd ??
              '',
          ) || null,

          baseDate:
            this.parseBaseDate(
              String(item.baseYmd ?? ''),
            ),

          requestPayload: {
            startYmd,
            endYmd,
          },

          responsePayload: item,
        })),
      });
    }

    return {
      startYmd,
      endYmd,

      metro: {
        endpoint:
          'metcoRegnVisitrDDList',
        rawApiCount:
          metro.fetchedRawCount,
        savedSeoulCount:
          metro.seoulItems.length,
      },

      local: {
        endpoint:
          'locgoRegnVisitrDDList',
        rawApiCount:
          local.fetchedRawCount,
        savedSeoulCount:
          local.seoulItems.length,
      },

      totalSaved:
        metro.seoulItems.length +
        local.seoulItems.length,
    };
  }
}