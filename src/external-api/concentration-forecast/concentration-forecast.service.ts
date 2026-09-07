import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

type District = {
  code: string;
  name: string;
};

@Injectable()
export class ConcentrationForecastService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B551011/TatsCnctrRateService';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getServiceKey(): string {
    const key =
      this.configService.get<string>('PUBLIC_DATA_SERVICE_KEY');

    if (!key) {
      throw new Error(
        'PUBLIC_DATA_SERVICE_KEY is not defined',
      );
    }

    return key;
  }

  private async getSource() {
    const source =
      await this.prisma.externalSource.findUnique({
        where: {
          code: 'CONCENTRATION_FORECAST_API',
        },
      });

    if (!source) {
      throw new Error(
        'CONCENTRATION_FORECAST_API does not exist in external_sources',
      );
    }

    return source;
  }

  private async request(
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
      `${this.baseUrl}/tatsCnctrRatedList` +
      `?serviceKey=${this.getServiceKey()}` +
      `&${query.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Concentration Forecast API failed: ` +
          `${response.status} ${response.statusText}\n${text}`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Concentration Forecast API returned non-JSON:\n${text}`,
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

  private async fetchDistrict(
    district: District,
  ) {
    const numOfRows = 1000;

    let pageNo = 1;
    let totalCount = 0;
    let fetched = 0;

    const allItems: any[] = [];

    while (true) {
      const requestPayload = {
        numOfRows,
        pageNo,
        areaCd: '11',
        signguCd: district.code,
      };

      const data =
        await this.request(requestPayload);

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

      allItems.push(...items);
      fetched += items.length;

      if (
        totalCount > 0 &&
        fetched >= totalCount
      ) {
        break;
      }

      pageNo++;
    }

    return {
      district,
      totalCount,
      items: allItems,
    };
  }

  /**
   * 현재 최신 30일 예측 snapshot만 유지한다.
   */
  async syncCurrentSeoulForecast() {
    const source =
      await this.getSource();

    const results = [];

    let apiCallCount = 0;
    let totalSaved = 0;

    /*
     * 먼저 모든 API 호출 성공 후,
     * 그 다음 기존 snapshot을 삭제한다.
     *
     * 중간 API 장애 때문에 기존 데이터까지
     * 날아가는 것을 피하기 위한 순서.
     */
    for (const district of this.seoulDistricts) {
      const result =
        await this.fetchDistrict(district);

      results.push(result);

      /*
       * 일반적으로 1페이지겠지만
       * totalCount 기준으로 실제 호출 수 계산
       */
      apiCallCount += Math.max(
        1,
        Math.ceil(result.totalCount / 1000),
      );

      console.log(
        `[ConcentrationForecast] ` +
          `${district.name}: ${result.items.length}`,
      );
    }

    await this.prisma.rawConcentrationForecastApi.deleteMany({
      where: {
        sourceId: source.id,
      },
    });

    for (const result of results) {
      if (result.items.length === 0) {
        continue;
      }

      await this.prisma.rawConcentrationForecastApi.createMany({
        data: result.items.map((item) => ({
          sourceId: source.id,

          endpoint: 'tatsCnctrRatedList',

          areaCode:
            String(item.areaCd ?? '11'),

          signguCode:
            String(
              item.signguCd ??
                result.district.code,
            ),

          attractionName:
            item.tAtsNm
              ? String(item.tAtsNm)
              : null,

          requestPayload: {
            areaCd: '11',
            signguCd:
              result.district.code,
          },

          responsePayload: item,
        })),
      });

      totalSaved +=
        result.items.length;
    }

    return {
      districtCount:
        this.seoulDistricts.length,
      apiCallCount,
      totalSaved,
      districts: results.map(
        (result) => ({
          signguCode:
            result.district.code,
          signguName:
            result.district.name,
          totalCount:
            result.totalCount,
          savedCount:
            result.items.length,
        }),
      ),
    };
  }
}