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

  private async normalizeVisitorMetrics(
    sourceId: bigint,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const raws =
      await this.prisma.rawRegionVisitorApi.findMany({
        where: {
          sourceId,
          baseDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: {
          id: 'asc',
        },
      });

    const regionCodes =
      await this.prisma.regionExternalCode.findMany({
        where: {
          sourceId,
        },
        select: {
          regionId: true,
          codeType: true,
          externalCode: true,
        },
      });

    const regionByCode =
      new Map<string, bigint>();

    for (const row of regionCodes) {
      regionByCode.set(
        `${row.codeType}:${row.externalCode}`,
        row.regionId,
      );
    }

    const metricRows = [];

    for (const raw of raws) {
      const payload =
        raw.responsePayload as Record<string, any>;

      let regionId: bigint | undefined;

      if (raw.signguCode) {
        regionId =
          regionByCode.get(
            `SIGUNGU_CODE:${raw.signguCode}`,
          );
      } else if (raw.areaCode) {
        regionId =
          regionByCode.get(
            `AREA_CODE:${raw.areaCode}`,
          );
      }

      if (!regionId) {
        throw new Error(
          `Region mapping not found: ` +
          `areaCode=${raw.areaCode}, ` +
          `signguCode=${raw.signguCode}`,
        );
      }

      if (
        payload.touNum == null ||
        raw.baseDate == null
      ) {
        continue;
      }

      metricRows.push({
        regionId,
        sourceId,

        metricFamily: 'VISITOR',
        metricCode: 'TOU_NUM',
        metricName: '방문자수',

        dayOfWeekCode:
          payload.daywkDivCd == null
            ? null
            : String(payload.daywkDivCd),

        dayOfWeekName:
          payload.daywkDivNm == null
            ? null
            : String(payload.daywkDivNm),

        visitorTypeCode:
          payload.touDivCd == null
            ? null
            : String(payload.touDivCd),

        visitorTypeName:
          payload.touDivNm == null
            ? null
            : String(payload.touDivNm),

        periodDate: raw.baseDate,
        periodMonth: null,

        metricValue:
          String(payload.touNum),

        fetchedAt:
          raw.fetchedAt,
      });
    }

    await this.prisma.regionMetric.deleteMany({
      where: {
        sourceId,
        periodDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if (metricRows.length > 0) {
      await this.prisma.regionMetric.createMany({
        data: metricRows,
      });
    }

    return metricRows.length;
  }

  /**
   * 서울 광역 + 자치구 방문자 데이터를
   * 지정 기간만큼 RAW 저장
   *
   * 같은 기간을 다시 실행하면
   * 해당 기간의 기존 RAW를 먼저 지우고 다시 저장.
   */
  /**
   * API 호출 + 메모리 적재만 수행한다.
   *
   * 여기서는 DB의 RAW / region_metrics를 변경하지 않는다.
   */
  async prepareSeoulVisitorData(
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

    const rawRows = [
      ...metro.seoulItems.map((item) => ({
        sourceId: source.id,

        endpoint:
          'metcoRegnVisitrDDList',

        areaCode:
          String(
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

        responsePayload:
          item,
      })),

      ...local.seoulItems.map((item) => ({
        sourceId: source.id,

        endpoint:
          'locgoRegnVisitrDDList',

        areaCode:
          String(
            item.areaCd ??
              item.areaCode ??
              '',
          ) || null,

        signguCode:
          String(
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

        responsePayload:
          item,
      })),
    ];

    /*
     * region_metrics도 RAW INSERT 이후 다시 읽지 않고,
     * 지금 확보한 payload에서 바로 만든다.
     */
    const regionCodes =
      await this.prisma.regionExternalCode.findMany({
        where: {
          sourceId: source.id,
        },

        select: {
          regionId: true,
          codeType: true,
          externalCode: true,
        },
      });

    const regionByCode =
      new Map<string, bigint>();

    for (const row of regionCodes) {
      regionByCode.set(
        `${row.codeType}:${row.externalCode}`,
        row.regionId,
      );
    }

    const metricRows = [];

    for (const raw of rawRows) {
      const payload =
        raw.responsePayload as Record<string, any>;

      let regionId:
        bigint | undefined;

      if (raw.signguCode) {
        regionId =
          regionByCode.get(
            `SIGUNGU_CODE:${raw.signguCode}`,
          );
      } else if (raw.areaCode) {
        regionId =
          regionByCode.get(
            `AREA_CODE:${raw.areaCode}`,
          );
      }

      if (!regionId) {
        throw new Error(
          `Region mapping not found: ` +
            `areaCode=${raw.areaCode}, ` +
            `signguCode=${raw.signguCode}`,
        );
      }

      if (
        payload.touNum == null ||
        raw.baseDate == null
      ) {
        throw new Error(
          'REGION_VISITOR returned incomplete item',
        );
      }

      metricRows.push({
        regionId,
        sourceId:
          source.id,

        metricFamily:
          'VISITOR',

        metricCode:
          'TOU_NUM',

        metricName:
          '방문자수',

        dayOfWeekCode:
          payload.daywkDivCd == null
            ? null
            : String(
                payload.daywkDivCd,
              ),

        dayOfWeekName:
          payload.daywkDivNm == null
            ? null
            : String(
                payload.daywkDivNm,
              ),

        visitorTypeCode:
          payload.touDivCd == null
            ? null
            : String(
                payload.touDivCd,
              ),

        visitorTypeName:
          payload.touDivNm == null
            ? null
            : String(
                payload.touDivNm,
              ),

        periodDate:
          raw.baseDate,

        periodMonth:
          null,

        metricValue:
          String(
            payload.touNum,
          ),

        fetchedAt:
          new Date(),
      });
    }

    return {
      sourceId:
        source.id,

      startYmd,
      endYmd,

      startDate,
      endDate,

      rawRows,
      metricRows,

      result: {
        startYmd,
        endYmd,

        normalizedCount:
          metricRows.length,

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
          rawRows.length,
      },
    };
  }

  /**
   * 이미 준비/검증된 데이터를 DB에 반영한다.
   *
   * tx는 Prisma transaction client를 받는다.
   */
  async applyPreparedSeoulVisitorData(
    prepared: Awaited<
      ReturnType<
        RegionVisitorService['prepareSeoulVisitorData']
      >
    >,
    tx: any,
  ) {
    await tx.rawRegionVisitorApi.deleteMany({
      where: {
        sourceId:
          prepared.sourceId,

        baseDate: {
          gte:
            prepared.startDate,

          lte:
            prepared.endDate,
        },
      },
    });

    if (
      prepared.rawRows.length > 0
    ) {
      await tx.rawRegionVisitorApi.createMany({
        data:
          prepared.rawRows,
      });
    }

    await tx.regionMetric.deleteMany({
      where: {
        sourceId:
          prepared.sourceId,

        periodDate: {
          gte:
            prepared.startDate,

          lte:
            prepared.endDate,
        },
      },
    });

    if (
      prepared.metricRows.length > 0
    ) {
      await tx.regionMetric.createMany({
        data:
          prepared.metricRows,
      });
    }
  }

  /**
   * 기존 controller / 수동 호출 호환용.
   *
   * 단일 REGION_VISITOR 실행도 자체적으로 atomic하게 처리한다.
   */
  async syncSeoulVisitorData(
    startYmd: string,
    endYmd: string,
  ) {
    const prepared =
      await this.prepareSeoulVisitorData(
        startYmd,
        endYmd,
      );

    await this.prisma.$transaction(
      async (tx) => {
        await this.applyPreparedSeoulVisitorData(
          prepared,
          tx,
        );
      },
    );

    return prepared.result;
  }
  private subtractMonth(
    baseYm: string,
    monthOffset: number,
  ): string {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error('baseYm must be YYYYMM');
    }

    const year = Number(baseYm.slice(0, 4));
    const month = Number(baseYm.slice(4, 6));

    const date = new Date(
      Date.UTC(year, month - 1 - monthOffset, 1),
    );

    return (
      String(date.getUTCFullYear()) +
      String(date.getUTCMonth() + 1).padStart(2, '0')
    );
  }

  private getMonthRange(baseYm: string) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error('baseYm must be YYYYMM');
    }

    const year = Number(baseYm.slice(0, 4));
    const month = Number(baseYm.slice(4, 6));

    if (month < 1 || month > 12) {
      throw new Error('Invalid baseYm');
    }

    const lastDay = new Date(
      Date.UTC(year, month, 0),
    ).getUTCDate();

    return {
      startYmd:
        `${baseYm}01`,
      endYmd:
        `${baseYm}${String(lastDay).padStart(2, '0')}`,
      dayCount:
        lastDay,
    };
  }

  /**
   * GAP 계산에 사용할 수 있는 완전한 월인지 확인.
   *
   * 서울 전체:
   *   1개 광역 × 일수 × 관광객유형 3개
   *
   * 서울 자치구:
   *   25개 구 × 일수 × 관광객유형 3개
   */
  async isCompleteMonth(
    baseYm: string,
  ): Promise<boolean> {
    const {
      startYmd,
      endYmd,
      dayCount,
    } = this.getMonthRange(baseYm);

    const counts =
      await this.countSeoulVisitorData(
        startYmd,
        endYmd,
      );

    const expectedMetro =
      dayCount * 3;

    const expectedLocal =
      25 * dayCount * 3;

    const metroComplete =
      counts.metro.seoulCount === expectedMetro;

    const localComplete =
      counts.local.seoulCount === expectedLocal;

    console.log(
      `[RegionVisitor] complete-month check ${baseYm}: ` +
      `metro=${counts.metro.seoulCount}/${expectedMetro}, ` +
      `local=${counts.local.seoulCount}/${expectedLocal}`,
    );

    return (
      metroComplete &&
      localComplete
    );
  }

  /**
   * 현재 월은 제외하고,
   * 최근 24개월 중 가장 최신 완전월 탐색.
   */
  async findLatestCompleteMonth(): Promise<string> {
    const now = new Date();

    const currentYm =
      String(now.getUTCFullYear()) +
      String(now.getUTCMonth() + 1).padStart(2, '0');

    /*
     * offset=1부터 시작:
     * 아직 끝나지 않은 현재 월은 검사하지 않는다.
     */
    for (let offset = 1; offset <= 24; offset++) {
      const baseYm =
        this.subtractMonth(
          currentYm,
          offset,
        );

      const complete =
        await this.isCompleteMonth(
          baseYm,
        );

      if (complete) {
        return baseYm;
      }
    }

    throw new Error(
      '최근 24개월 안에서 완전한 REGION_VISITOR 월을 찾지 못했습니다.',
    );
  }

  /**
   * YYYYMM 기준으로 한 달 전체 방문자 데이터 수집.
   */
  async syncSeoulVisitorMonth(
    baseYm: string,
  ) {
    const {
      startYmd,
      endYmd,
    } = this.getMonthRange(baseYm);

    return this.syncSeoulVisitorData(
      startYmd,
      endYmd,
    );
  }
}