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
export class TourismDemandStrengthService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B551011/AreaTarDemDsService';

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

  private readonly stayIndicators: Indicator[] = [
    { code: '21', name: '관광 체류 강도' },
    { code: '2101', name: '타권역 방문자 비중' },
    { code: '2102', name: '숙박 비중' },
    { code: '2103', name: '1박 방문자수' },
    { code: '2104', name: '2박 방문자수' },
    { code: '2105', name: '3박 방문자수' },
  ];

  private readonly expenditureIndicators: Indicator[] = [
    { code: '22', name: '관광 소비 강도' },
    { code: '2201', name: '외지인 소비액' },
    { code: '2202', name: '전체 대비 외지인 소비액 비중' },
    { code: '2203', name: '방문량 대비 방문 소비액' },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getServiceKey(): string {
    const key =
      this.configService.get<string>('PUBLIC_DATA_SERVICE_KEY');

    if (!key) {
      throw new Error('PUBLIC_DATA_SERVICE_KEY is not defined');
    }

    return key;
  }

  private async getSource() {
    const source = await this.prisma.externalSource.findUnique({
      where: {
        code: 'TOURISM_DEMAND_STRENGTH_API',
      },
    });

    if (!source) {
      throw new Error(
        'TOURISM_DEMAND_STRENGTH_API does not exist in external_sources',
      );
    }

    return source;
  }

  private async request(
    endpoint: string,
    params: Record<string, string | number>,
  ) {
    const query = new URLSearchParams();

    query.set('MobileOS', 'ETC');
    query.set('MobileApp', 'Goyohaeng');
    query.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }

    const url =
      `${this.baseUrl}/${endpoint}` +
      `?serviceKey=${this.getServiceKey()}&${query.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Tourism Demand Strength API failed: ` +
          `${response.status} ${response.statusText}\n${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Tourism Demand Strength API returned non-JSON:\n${text}`,
      );
    }
  }

  private extractItems(data: any): any[] {
    const item = data?.response?.body?.items?.item;

    if (!item) {
      return [];
    }

    return Array.isArray(item) ? item : [item];
  }

  private subtractMonth(
    baseYm: string,
    offset: number,
  ): string {
    const year = Number(baseYm.slice(0, 4));
    const month = Number(baseYm.slice(4, 6));

    const date = new Date(
      Date.UTC(year, month - 1 - offset, 1),
    );

    return (
      String(date.getUTCFullYear()) +
      String(date.getUTCMonth() + 1).padStart(2, '0')
    );
  }

  async monthHasData(
    baseYm: string,
  ): Promise<boolean> {
    const data = await this.request(
      'areaTarSjrnDsList',
      {
        pageNo: 1,
        numOfRows: 1,
        baseYm,
        areaCd: '11',
        signguCd: '11530',
        tarSjrnDsIxCd: '2101',
      },
    );

    return this.extractItems(data).length > 0;
  }

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
        `[TourismDemandStrength] ${baseYm}: ` +
          `${available ? 'AVAILABLE' : 'no data'}`,
      );

      if (available) {
        return baseYm;
      }
    }

    throw new Error(
      '최근 24개월 내 관광 수요 강도 데이터를 찾지 못했습니다.',
    );
  }

  private async fetchStay(
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
      tarSjrnDsIxCd: indicator.code,
    };

    const data = await this.request(
      'areaTarSjrnDsList',
      requestPayload,
    );

    return {
      requestPayload,
      items: this.extractItems(data),
    };
  }

  private async fetchExpenditure(
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
      tarExpDsIxCd: indicator.code,
    };

    const data = await this.request(
      'areaTarExpDsList',
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
      await this.prisma.rawTourismDemandStrengthApi.findMany({
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
        raw.endpoint === 'areaTarSjrnDsList'
      ) {
        if (
          payload.tarSjrnDsIxCd == null ||
          payload.tarSjrnDsIxVal == null
        ) {
          continue;
        }

        metricRows.push({
          regionId,
          sourceId,
          metricFamily: 'STAY_STRENGTH',
          metricCode:
            String(payload.tarSjrnDsIxCd),
          metricName:
            payload.tarSjrnDsIxNm == null
              ? null
              : String(payload.tarSjrnDsIxNm),
          dayOfWeekCode: null,
          dayOfWeekName: null,
          visitorTypeCode: null,
          visitorTypeName: null,
          periodDate: null,
          periodMonth: baseYm,
          metricValue:
            String(payload.tarSjrnDsIxVal),
          fetchedAt: raw.fetchedAt,
        });
      }

      if (
        raw.endpoint === 'areaTarExpDsList'
      ) {
        if (
          payload.tarExpDsIxCd == null ||
          payload.tarExpDsIxVal == null
        ) {
          continue;
        }

        metricRows.push({
          regionId,
          sourceId,
          metricFamily: 'EXPENDITURE_STRENGTH',
          metricCode:
            String(payload.tarExpDsIxCd),
          metricName:
            payload.tarExpDsIxNm == null
              ? null
              : String(payload.tarExpDsIxNm),
          dayOfWeekCode: null,
          dayOfWeekName: null,
          visitorTypeCode: null,
          visitorTypeName: null,
          periodDate: null,
          periodMonth: baseYm,
          metricValue:
            String(payload.tarExpDsIxVal),
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
   * API 호출 + 메모리 준비만 수행.
   * DB는 변경하지 않는다.
   */
  async prepareSeoulStrength(
    baseYm: string,
  ) {
    if (!/^\d{6}$/.test(baseYm)) {
      throw new Error(
        'baseYm must be YYYYMM',
      );
    }

    const available =
      await this.monthHasData(baseYm);

    if (!available) {
      throw new Error(
        `Tourism Demand Strength data is not available for ${baseYm}`,
      );
    }

    const source =
      await this.getSource();

    const regionCodes =
      await this.prisma.regionExternalCode.findMany({
        where: {
          sourceId:
            source.id,

          codeType:
            'SIGUNGU_CODE',
        },

        select: {
          regionId:
            true,

          externalCode:
            true,
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

    const rawRows: any[] = [];
    const metricRows: any[] = [];

    let staySaved = 0;
    let expenditureSaved = 0;
    let apiCallCount = 0;
    let stayNoData = 0;
    let expenditureNoData = 0;

    /*
     * 1. 체류 강도
     */
    for (const district of this.seoulDistricts) {
      const regionId =
        regionByCode.get(
          district.code,
        );

      if (!regionId) {
        throw new Error(
          `Region mapping not found: ${district.code}`,
        );
      }

      for (const indicator of this.stayIndicators) {
        const result =
          await this.fetchStay(
            baseYm,
            district,
            indicator,
          );

        apiCallCount++;

        if (result.items.length === 0) {
          stayNoData++;
          continue;
        }

        for (const item of result.items) {
          const itemBaseYm =
            String(
              item.baseYm ??
                baseYm,
            );

          const signguCode =
            String(
              item.signguCd ??
                district.code,
            );

          if (itemBaseYm !== baseYm) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected baseYm: ` +
                `${itemBaseYm} (requested ${baseYm})`,
            );
          }

          if (signguCode !== district.code) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected district: ` +
                `${signguCode} (requested ${district.code})`,
            );
          }

          if (
            String(
              item.tarSjrnDsIxCd ?? '',
            ) !== indicator.code
          ) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected stay indicator: ` +
                `${item.tarSjrnDsIxCd}`,
            );
          }

          if (
            item.tarSjrnDsIxVal == null
          ) {
            throw new Error(
              `DEMAND_STRENGTH missing value: ` +
                `${district.code}/${indicator.code}`,
            );
          }

          const fetchedAt =
            new Date();

          rawRows.push({
            sourceId:
              source.id,

            endpoint:
              'areaTarSjrnDsList',

            areaCode:
              String(
                item.areaCd ??
                  '11',
              ),

            signguCode,

            baseMonth:
              itemBaseYm,

            requestPayload:
              result.requestPayload,

            responsePayload:
              item,

            fetchedAt,
          });

          metricRows.push({
            regionId,
            sourceId:
              source.id,

            metricFamily:
              'STAY_STRENGTH',

            metricCode:
              indicator.code,

            metricName:
              item.tarSjrnDsIxNm == null
                ? indicator.name
                : String(
                    item.tarSjrnDsIxNm,
                  ),

            dayOfWeekCode:
              null,

            dayOfWeekName:
              null,

            visitorTypeCode:
              null,

            visitorTypeName:
              null,

            periodDate:
              null,

            periodMonth:
              baseYm,

            metricValue:
              String(
                item.tarSjrnDsIxVal,
              ),

            fetchedAt,
          });

          staySaved++;
        }
      }
    }

    /*
     * 2. 소비 강도
     */
    for (const district of this.seoulDistricts) {
      const regionId =
        regionByCode.get(
          district.code,
        );

      if (!regionId) {
        throw new Error(
          `Region mapping not found: ${district.code}`,
        );
      }

      for (const indicator of this.expenditureIndicators) {
        const result =
          await this.fetchExpenditure(
            baseYm,
            district,
            indicator,
          );

        apiCallCount++;

        if (result.items.length === 0) {
          expenditureNoData++;
          continue;
        }

        for (const item of result.items) {
          const itemBaseYm =
            String(
              item.baseYm ??
                baseYm,
            );

          const signguCode =
            String(
              item.signguCd ??
                district.code,
            );

          if (itemBaseYm !== baseYm) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected baseYm: ` +
                `${itemBaseYm} (requested ${baseYm})`,
            );
          }

          if (signguCode !== district.code) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected district: ` +
                `${signguCode} (requested ${district.code})`,
            );
          }

          if (
            String(
              item.tarExpDsIxCd ?? '',
            ) !== indicator.code
          ) {
            throw new Error(
              `DEMAND_STRENGTH returned unexpected expenditure indicator: ` +
                `${item.tarExpDsIxCd}`,
            );
          }

          if (
            item.tarExpDsIxVal == null
          ) {
            throw new Error(
              `DEMAND_STRENGTH missing value: ` +
                `${district.code}/${indicator.code}`,
            );
          }

          const fetchedAt =
            new Date();

          rawRows.push({
            sourceId:
              source.id,

            endpoint:
              'areaTarExpDsList',

            areaCode:
              String(
                item.areaCd ??
                  '11',
              ),

            signguCode,

            baseMonth:
              itemBaseYm,

            requestPayload:
              result.requestPayload,

            responsePayload:
              item,

            fetchedAt,
          });

          metricRows.push({
            regionId,
            sourceId:
              source.id,

            metricFamily:
              'EXPENDITURE_STRENGTH',

            metricCode:
              indicator.code,

            metricName:
              item.tarExpDsIxNm == null
                ? indicator.name
                : String(
                    item.tarExpDsIxNm,
                  ),

            dayOfWeekCode:
              null,

            dayOfWeekName:
              null,

            visitorTypeCode:
              null,

            visitorTypeName:
              null,

            periodDate:
              null,

            periodMonth:
              baseYm,

            metricValue:
              String(
                item.tarExpDsIxVal,
              ),

            fetchedAt,
          });

          expenditureSaved++;
        }
      }
    }

    return {
      sourceId:
        source.id,

      baseYm,

      rawRows,
      metricRows,

      result: {
        baseYm,

        districtCount:
          this.seoulDistricts.length,

        stayIndicatorCount:
          this.stayIndicators.length,

        expenditureIndicatorCount:
          this.expenditureIndicators.length,

        apiCallCount,

        staySaved,
        expenditureSaved,

        stayNoData,
        expenditureNoData,

        totalSaved:
          rawRows.length,

        normalizedCount:
          metricRows.length,
      },
    };
  }

  async applyPreparedSeoulStrength(
    prepared: Awaited<
      ReturnType<
        TourismDemandStrengthService['prepareSeoulStrength']
      >
    >,
    tx: any,
  ) {
    await tx.rawTourismDemandStrengthApi.deleteMany({
      where: {
        sourceId:
          prepared.sourceId,

        baseMonth:
          prepared.baseYm,
      },
    });

    if (
      prepared.rawRows.length > 0
    ) {
      await tx.rawTourismDemandStrengthApi.createMany({
        data:
          prepared.rawRows,
      });
    }

    await tx.regionMetric.deleteMany({
      where: {
        sourceId:
          prepared.sourceId,

        periodMonth:
          prepared.baseYm,
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

  async syncSeoulStrength(
    baseYm: string,
  ) {
    const prepared =
      await this.prepareSeoulStrength(
        baseYm,
      );

    await this.prisma.$transaction(
      async (tx) => {
        await this.applyPreparedSeoulStrength(
          prepared,
          tx,
        );
      },
    );

    return prepared.result;
  }

  async syncLatestSeoulStrength() {
    const baseYm =
      await this.findLatestAvailableMonth();

    return this.syncSeoulStrength(
      baseYm,
    );
  }
}