import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

type District = {
  code: string;
  name: string;
};

type Indicator = {
  code: string;
  name: string;
};

@Injectable()
export class TourismResourceDemandService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B551011/AreaTarResDemService';

  /**
   * 첨부된 한국관광공사 시군구 코드표 기준
   * 서울특별시 25개 자치구
   */
  private readonly seoulDistricts: District[] = [
    { code: '11110', name: '종로구' },
    { code: '11140', name: '중구' },
    { code: '11170', name: '용산구' },
    { code: '11200', name: '성동구' },
    { code: '11215', name: '광진구' },
    { code: '11230', name: '동대문구' },
    { code: '11260', name: '중랑구' },
    { code: '11290', name: '성북구' },
    { code: '11305', name: '강북구' },
    { code: '11320', name: '도봉구' },
    { code: '11350', name: '노원구' },
    { code: '11380', name: '은평구' },
    { code: '11410', name: '서대문구' },
    { code: '11440', name: '마포구' },
    { code: '11470', name: '양천구' },
    { code: '11500', name: '강서구' },
    { code: '11530', name: '구로구' },
    { code: '11545', name: '금천구' },
    { code: '11560', name: '영등포구' },
    { code: '11590', name: '동작구' },
    { code: '11620', name: '관악구' },
    { code: '11650', name: '서초구' },
    { code: '11680', name: '강남구' },
    { code: '11710', name: '송파구' },
    { code: '11740', name: '강동구' },
  ];

  /**
   * 관광 서비스 수요 지표
   *
   * 매뉴얼의 전체 코드(11) + 세부지표(1101~1112)
   * 모두 저장한다.
   */
  private readonly serviceIndicators: Indicator[] = [
    { code: '11', name: '전체' },
    { code: '1101', name: '레포츠 여행 유형 SNS 언급량' },
    { code: '1102', name: '휴식 힐링 여행 유형 SNS 언급량' },
    { code: '1103', name: '미식 여행 유형 SNS 언급량' },
    { code: '1104', name: '체험 여행 유형 SNS 언급량' },
    { code: '1105', name: '쇼핑업 소비액' },
    { code: '1106', name: '식음료 소비액' },
    { code: '1107', name: '숙박업 소비액' },
    { code: '1108', name: '여가 서비스업 소비액' },
    { code: '1109', name: '운송업 소비액' },
    { code: '1110', name: '내비게이션 숙박 유형 검색량' },
    { code: '1111', name: '내비게이션 음식 유형 검색량' },
    { code: '1112', name: '내비게이션 쇼핑 유형 검색량' },
  ];

  /**
   * 문화 자원 수요 지표
   *
   * 매뉴얼의 전체 코드(12) + 세부지표(1201~1205)
   */
  private readonly culturalIndicators: Indicator[] = [
    { code: '12', name: '전체' },
    { code: '1201', name: '내비게이션 문화 관광 유형 검색량' },
    { code: '1202', name: '내비게이션 레저 스포츠 유형 검색량' },
    { code: '1203', name: '내비게이션 역사 관광 유형 검색량' },
    { code: '1204', name: '내비게이션 체험 관광 유형 검색량' },
    { code: '1205', name: '내비게이션 자연 관광 유형 검색량' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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

  private async getSource() {
    const source =
      await this.prisma.externalSource.findUnique({
        where: {
          code: 'TOURISM_RESOURCE_DEMAND_API',
        },
      });

    if (!source) {
      throw new Error(
        'TOURISM_RESOURCE_DEMAND_API does not exist in external_sources',
      );
    }

    return source;
  }

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

    const url =
      `${this.baseUrl}/${endpoint}` +
      `?serviceKey=${serviceKey}` +
      `&${queryParams.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Tourism Resource Demand API request failed: ` +
          `${response.status} ${response.statusText}\n${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Tourism Resource Demand API returned non-JSON response:\n${text}`,
      );
    }
  }

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
   * YYYYMM에서 monthOffset만큼 이전 월 계산.
   */
  private subtractMonth(
    baseYm: string,
    monthOffset: number,
  ): string {
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

  /**
   * 특정 월에 실제 데이터가 존재하는지 확인.
   *
   * 매뉴얼에서 실제 성공이 확인된 형태:
   * 구로구(11530) + 서비스지표 1112
   */
  private async monthHasData(
    baseYm: string,
  ): Promise<boolean> {
    const data = await this.request(
      'areaTarSvcDemList',
      {
        pageNo: 1,
        numOfRows: 1,
        baseYm,
        areaCd: '11',
        signguCd: '11530',
        tarSvcDemIxCd: '1112',
      },
    );

    return this.extractItems(data).length > 0;
  }

  /**
   * 최근 24개월 안에서 가장 최신 제공월 자동 탐색.
   */
  async findLatestAvailableMonth() {
    const now = new Date();

    const currentYm =
      String(now.getUTCFullYear()) +
      String(now.getUTCMonth() + 1).padStart(2, '0');

    for (let offset = 0; offset < 24; offset++) {
      const baseYm =
        this.subtractMonth(currentYm, offset);

      const available =
        await this.monthHasData(baseYm);

      console.log(
        `[TourismResourceDemand] check ${baseYm}: ` +
          `${available ? 'AVAILABLE' : 'no data'}`,
      );

      if (available) {
        return baseYm;
      }
    }

    throw new Error(
      '최근 24개월 안에서 관광 자원 수요 데이터를 찾지 못했습니다.',
    );
  }

  /**
   * 관광 서비스 수요 1건 조회
   */
  private async fetchServiceDemand(
    baseYm: string,
    district: District,
    indicator: Indicator,
  ) {
    const requestPayload = {
      pageNo: 1,
      numOfRows: 10,
      baseYm,
      areaCd: '11',
      signguCd: district.code,
      tarSvcDemIxCd: indicator.code,
    };

    const data = await this.request(
      'areaTarSvcDemList',
      requestPayload,
    );

    return {
      requestPayload,
      items: this.extractItems(data),
    };
  }

  /**
   * 문화 자원 수요 1건 조회
   */
  private async fetchCulturalDemand(
    baseYm: string,
    district: District,
    indicator: Indicator,
  ) {
    const requestPayload = {
      pageNo: 1,
      numOfRows: 10,
      baseYm,
      areaCd: '11',
      signguCd: district.code,
      culResDemIxCd: indicator.code,
    };

    const data = await this.request(
      'areaCulResDemList',
      requestPayload,
    );

    return {
      requestPayload,
      items: this.extractItems(data),
    };
  }

  private async normalizeRegionMetrics(
    sourceId: bigint,
    baseYm: string,
  ): Promise<number> {
    const raws =
      await this.prisma.rawTourismResourceDemandApi.findMany({
        where: {
          sourceId,
          baseMonth: baseYm,
        },
        orderBy: {
          id: 'asc',
        },
      });

    const regionCodes =
      await this.prisma.regionExternalCode.findMany({
        where: {
          sourceId,
          codeType: 'SIGUNGU_CODE',
        },
        select: {
          regionId: true,
          externalCode: true,
        },
      });

    const regionByCode =
      new Map<string, bigint>();

    for (const row of regionCodes) {
      regionByCode.set(
        row.externalCode,
        row.regionId,
      );
    }

    const metricRows = [];

    for (const raw of raws) {
      if (!raw.signguCode) {
        continue;
      }

      const regionId =
        regionByCode.get(raw.signguCode);

      if (!regionId) {
        throw new Error(
          `Region mapping not found: ${raw.signguCode}`,
        );
      }

      const payload =
        raw.responsePayload as Record<string, any>;

      if (
        raw.endpoint === 'areaTarSvcDemList'
      ) {
        if (
          payload.tarSvcDemIxCd == null ||
          payload.tarSvcDemIxVal == null
        ) {
          continue;
        }

        metricRows.push({
          regionId,
          sourceId,
          metricFamily: 'SERVICE_DEMAND',
          metricCode:
            String(payload.tarSvcDemIxCd),
          metricName:
            payload.tarSvcDemIxNm == null
              ? null
              : String(payload.tarSvcDemIxNm),
          dayOfWeekCode: null,
          dayOfWeekName: null,
          visitorTypeCode: null,
          visitorTypeName: null,
          periodDate: null,
          periodMonth: baseYm,
          metricValue:
            String(payload.tarSvcDemIxVal),
          fetchedAt: raw.fetchedAt,
        });
      }

      if (
        raw.endpoint === 'areaCulResDemList'
      ) {
        if (
          payload.culResDemIxCd == null ||
          payload.culResDemIxVal == null
        ) {
          continue;
        }

        metricRows.push({
          regionId,
          sourceId,
          metricFamily: 'CULTURAL_DEMAND',
          metricCode:
            String(payload.culResDemIxCd),
          metricName:
            payload.culResDemIxNm == null
              ? null
              : String(payload.culResDemIxNm),
          dayOfWeekCode: null,
          dayOfWeekName: null,
          visitorTypeCode: null,
          visitorTypeName: null,
          periodDate: null,
          periodMonth: baseYm,
          metricValue:
            String(payload.culResDemIxVal),
          fetchedAt: raw.fetchedAt,
        });
      }
    }

    await this.prisma.regionMetric.deleteMany({
      where: {
        sourceId,
        periodMonth: baseYm,
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
   * 최신 제공월을 자동으로 찾은 뒤
   * 서울 25개 구 × 모든 지표 RAW 저장.
   */
  async syncLatestSeoulDemand() {
    const source = await this.getSource();

    const baseYm =
      await this.findLatestAvailableMonth();

    /*
     * 해당 월을 다시 실행하면 중복되지 않도록
     * 그 월 데이터만 먼저 삭제.
     */
    const deleted =
      await this.prisma.rawTourismResourceDemandApi.deleteMany({
        where: {
          sourceId: source.id,
          baseMonth: baseYm,
        },
      });

    console.log(
      `[TourismResourceDemand] deleted previous ${baseYm}: ` +
        deleted.count,
    );

    let apiCallCount = 0;

    let serviceSaved = 0;
    let culturalSaved = 0;

    let serviceNoData = 0;
    let culturalNoData = 0;

    /*
     * 1. 관광 서비스 수요
     */
    for (const district of this.seoulDistricts) {
      for (const indicator of this.serviceIndicators) {
        const result =
          await this.fetchServiceDemand(
            baseYm,
            district,
            indicator,
          );

        apiCallCount++;

        if (result.items.length === 0) {
          serviceNoData++;
          continue;
        }

        await this.prisma.rawTourismResourceDemandApi.createMany({
          data: result.items.map((item) => ({
            sourceId: source.id,

            endpoint: 'areaTarSvcDemList',

            areaCode:
              String(item.areaCd ?? '11'),

            signguCode:
              String(
                item.signguCd ??
                  district.code,
              ),

            baseMonth:
              String(
                item.baseYm ??
                  baseYm,
              ),

            requestPayload:
              result.requestPayload,

            responsePayload: item,
          })),
        });

        serviceSaved += result.items.length;
      }

      console.log(
        `[TourismResourceDemand] service completed: ` +
          `${district.name}`,
      );
    }

    /*
     * 2. 문화 자원 수요
     */
    for (const district of this.seoulDistricts) {
      for (const indicator of this.culturalIndicators) {
        const result =
          await this.fetchCulturalDemand(
            baseYm,
            district,
            indicator,
          );

        apiCallCount++;

        if (result.items.length === 0) {
          culturalNoData++;
          continue;
        }

        await this.prisma.rawTourismResourceDemandApi.createMany({
          data: result.items.map((item) => ({
            sourceId: source.id,

            endpoint: 'areaCulResDemList',

            areaCode:
              String(item.areaCd ?? '11'),

            signguCode:
              String(
                item.signguCd ??
                  district.code,
              ),

            baseMonth:
              String(
                item.baseYm ??
                  baseYm,
              ),

            requestPayload:
              result.requestPayload,

            responsePayload: item,
          })),
        });

        culturalSaved += result.items.length;
      }

      console.log(
        `[TourismResourceDemand] cultural completed: ` +
          `${district.name}`,
      );
    }
    const normalizedCount =
      await this.normalizeRegionMetrics(
        source.id,
        baseYm,
      );

    return {
      baseYm,

      districtCount:
        this.seoulDistricts.length,

      serviceIndicatorCount:
        this.serviceIndicators.length,

      culturalIndicatorCount:
        this.culturalIndicators.length,

      apiCallCount,

      serviceDemand: {
        savedCount: serviceSaved,
        noDataCombinations: serviceNoData,
      },

      culturalDemand: {
        savedCount: culturalSaved,
        noDataCombinations: culturalNoData,
      },

      totalSaved:
        serviceSaved +
        culturalSaved,
      normalizedCount,
    };
  }
}