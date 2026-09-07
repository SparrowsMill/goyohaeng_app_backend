import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SmallBusinessService {
  private readonly baseUrl =
    'https://apis.data.go.kr/B553077/api/open/sdsc2';

  /**
   * 고요행에서 수집하기로 확정한 업종 중분류
   */
  private readonly selectedCategories = [
    // 음식
    { largeCode: 'I2', middleCode: 'I201', name: '한식' },
    { largeCode: 'I2', middleCode: 'I202', name: '중식' },
    { largeCode: 'I2', middleCode: 'I203', name: '일식' },
    { largeCode: 'I2', middleCode: 'I204', name: '서양식' },
    { largeCode: 'I2', middleCode: 'I205', name: '동남아시아' },
    { largeCode: 'I2', middleCode: 'I206', name: '기타 외국' },
    { largeCode: 'I2', middleCode: 'I210', name: '기타 간이' },
    { largeCode: 'I2', middleCode: 'I211', name: '주점' },
    { largeCode: 'I2', middleCode: 'I212', name: '비알코올' },

    // 숙박
    { largeCode: 'I1', middleCode: 'I101', name: '일반 숙박' },
    { largeCode: 'I1', middleCode: 'I102', name: '기타 숙박' },

    // 예술·스포츠
    { largeCode: 'R1', middleCode: 'R101', name: '창작·예술' },
    { largeCode: 'R1', middleCode: 'R102', name: '도서관·사적지' },
    { largeCode: 'R1', middleCode: 'R103', name: '스포츠 서비스' },
    { largeCode: 'R1', middleCode: 'R104', name: '유원지·오락' },
  ];

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
      throw new Error('PUBLIC_DATA_SERVICE_KEY is not defined');
    }

    return serviceKey;
  }

  /**
   * external_sources에서 SMALL_BUSINESS_API 조회
   */
  private async getSource() {
    const source = await this.prisma.externalSource.findUnique({
      where: {
        code: 'SMALL_BUSINESS_API',
      },
    });

    if (!source) {
      throw new Error(
        'SMALL_BUSINESS_API does not exist in external_sources',
      );
    }

    return source;
  }

  /**
   * 소상공인 API 공통 GET 요청
   */
  private async request(
    endpoint: string,
    params: Record<string, string | number> = {},
  ) {
    const serviceKey = this.getServiceKey();

    const queryParams = new URLSearchParams();

    queryParams.set('type', 'json');

    for (const [key, value] of Object.entries(params)) {
      queryParams.set(key, String(value));
    }

    /*
     * serviceKey는 TourAPI 때와 동일하게
     * 중복 URL encoding을 피하기 위해 직접 붙인다.
     */
    const url =
      `${this.baseUrl}/${endpoint}` +
      `?serviceKey=${serviceKey}&${queryParams.toString()}`;

    const response = await fetch(url);

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Small Business API request failed: ` +
          `${response.status} ${response.statusText}\n${text}`,
      );
    }

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Small Business API returned non-JSON response:\n${text}`,
      );
    }

    return data;
  }

  /**
   * API response에서 상가 목록 추출
   */
  private extractItems(data: any): any[] {
    const items = data?.body?.items;

    if (!items) {
      return [];
    }

    return Array.isArray(items) ? items : [items];
  }

  /**
   * 서울 전체 상가 1페이지 테스트
   */
  async fetchSeoulFirstPage() {
    const source = await this.getSource();

    const params = {
      divId: 'ctprvnCd',
      key: '11',
      numOfRows: 100,
      pageNo: 1,
    };

    const data = await this.request(
      'storeListInDong',
      params,
    );

    const items = this.extractItems(data);

    for (const item of items) {
      await this.prisma.rawSmallBusinessApi.create({
        data: {
          sourceId: source.id,
          endpoint: 'storeListInDong',

          businessId: item.bizesId
            ? String(item.bizesId)
            : null,

          requestPayload: params,
          responsePayload: item,

          /*
           * storeListInDong에는 변경구분/변경일을
           * 직접 매핑하지 않는다.
           *
           * 해당 필드는 향후 storeListByDate 수집에서 사용.
           */
          sourceChangeType: null,
          sourceChangeDate: null,
        },
      });
    }

    return {
      ctprvnCd: '11',
      ctprvnNm: '서울특별시',
      pageNo: 1,
      requestedRows: 100,
      savedCount: items.length,
      totalCount: Number(
        data?.body?.totalCount ?? 0,
      ),
    };
  }

  /**
   * 업종 대분류 목록
   */
  async fetchLargeCategories() {
    const data = await this.request(
      'largeUpjongList',
    );

    const items = this.extractItems(data);

    return {
      totalCount: items.length,
      items,
    };
  }

  /**
   * 업종 중분류 목록
   */
  async fetchMiddleCategories(
    largeCode: string,
  ) {
    const data = await this.request(
      'middleUpjongList',
      {
        indsLclsCd: largeCode,
      },
    );

    const items = this.extractItems(data);

    return {
      largeCode,
      totalCount: items.length,
      items,
    };
  }

  /**
   * 업종 소분류 목록
   */
  async fetchSmallCategories(
    largeCode: string,
    middleCode: string,
  ) {
    const data = await this.request(
      'smallUpjongList',
      {
        indsLclsCd: largeCode,
        indsMclsCd: middleCode,
      },
    );

    const items = this.extractItems(data);

    return {
      largeCode,
      middleCode,
      totalCount: items.length,
      items,
    };
  }

  /**
   * 서울 + 대분류 건수 조회
   */
  async fetchSeoulCountByLargeCategory(
    largeCode: string,
  ) {
    const params = {
      divId: 'ctprvnCd',
      key: '11',
      indsLclsCd: largeCode,
      numOfRows: 1,
      pageNo: 1,
    };

    const data = await this.request(
      'storeListInDong',
      params,
    );

    return {
      ctprvnCd: '11',
      ctprvnNm: '서울특별시',
      largeCode,
      totalCount: Number(
        data?.body?.totalCount ?? 0,
      ),
    };
  }

  /**
   * 서울 + 중분류 건수 조회
   */
  async fetchSeoulCountByMiddleCategory(
    largeCode: string,
    middleCode: string,
  ) {
    const params = {
      divId: 'ctprvnCd',
      key: '11',
      indsLclsCd: largeCode,
      indsMclsCd: middleCode,
      numOfRows: 1,
      pageNo: 1,
    };

    const data = await this.request(
      'storeListInDong',
      params,
    );

    return {
      ctprvnCd: '11',
      ctprvnNm: '서울특별시',
      largeCode,
      middleCode,
      totalCount: Number(
        data?.body?.totalCount ?? 0,
      ),
    };
  }

  /**
   * 현재 선택된 수집 대상 목록 확인
   */
  getSelectedCategories() {
    return {
      city: {
        code: '11',
        name: '서울특별시',
      },
      categoryCount:
        this.selectedCategories.length,
      categories: this.selectedCategories,
    };
  }

  /**
   * 서울 + 선택 업종 전체 RAW 수집
   *
   * 정책:
   * - storeListInDong 현재 스냅샷만 유지
   * - 실행 시작 시 기존 storeListInDong RAW 삭제
   * - 1000건씩 API 요청
   * - 페이지별 createMany
   *
   * 추후 분기별 변경사항은 storeListByDate로 별도 수집
   */
  async syncSelectedSeoulStores() {
    const source = await this.getSource();

    /*
     * 현재 snapshot 교체.
     *
     * 같은 endpoint를 다시 실행해도
     * 17만 건이 중복 누적되지 않게 한다.
     */
    const deleted =
      await this.prisma.rawSmallBusinessApi.deleteMany({
        where: {
          sourceId: source.id,
          endpoint: 'storeListInDong',
        },
      });

    console.log(
      `[SmallBusiness] deleted previous snapshot: ${deleted.count}`,
    );

    /*
     * API에는 우선 페이지당 1000건을 요청한다.
     *
     * API가 더 작은 크기로 제한하면
     * 첫 페이지의 실제 반환 개수를 이용해서
     * totalPages를 다시 계산한다.
     */
    const requestedRows = 1000;

    let totalExpected = 0;
    let totalFetched = 0;
    let totalInserted = 0;

    const categoryResults: Array<{
      largeCode: string;
      middleCode: string;
      name: string;
      totalCount: number;
      fetchedCount: number;
      insertedCount: number;
      totalPages: number;
    }> = [];

    for (const category of this.selectedCategories) {
      let pageNo = 1;
      let totalCount = 0;
      let totalPages = 0;

      let fetchedCount = 0;
      let insertedCount = 0;

      /*
       * 첫 페이지 조회
       */
      const firstParams = {
        divId: 'ctprvnCd',
        key: '11',

        indsLclsCd: category.largeCode,
        indsMclsCd: category.middleCode,

        numOfRows: requestedRows,
        pageNo: 1,
      };

      const firstData = await this.request(
        'storeListInDong',
        firstParams,
      );

      const firstItems =
        this.extractItems(firstData);

      totalCount = Number(
        firstData?.body?.totalCount ?? 0,
      );

      /*
       * 0건 분류는 바로 넘어간다.
       * R101 등이 이에 해당할 수 있다.
       */
      if (
        totalCount === 0 ||
        firstItems.length === 0
      ) {
        console.log(
          `[SmallBusiness] ${category.middleCode} ` +
            `${category.name}: 0 items`,
        );

        categoryResults.push({
          ...category,
          totalCount: 0,
          fetchedCount: 0,
          insertedCount: 0,
          totalPages: 0,
        });

        continue;
      }

      /*
       * 실제 첫 페이지 반환량 사용.
       *
       * requestedRows=1000을 보냈더라도
       * API가 100 등으로 제한하는 경우를 대비한다.
       */
      const actualPageSize =
        firstItems.length;

      totalPages = Math.ceil(
        totalCount / actualPageSize,
      );

      totalExpected += totalCount;

      /*
       * 첫 페이지 저장
       */
      await this.prisma.rawSmallBusinessApi.createMany({
        data: firstItems.map((item) => ({
          sourceId: source.id,
          endpoint: 'storeListInDong',

          businessId: item.bizesId
            ? String(item.bizesId)
            : null,

          requestPayload: firstParams,
          responsePayload: item,

          sourceChangeType: null,
          sourceChangeDate: null,
        })),
      });

      fetchedCount += firstItems.length;
      insertedCount += firstItems.length;

      totalFetched += firstItems.length;
      totalInserted += firstItems.length;

      console.log(
        `[SmallBusiness] ${category.middleCode} ` +
          `${category.name} ` +
          `page 1/${totalPages} ` +
          `(${firstItems.length} items)`,
      );

      /*
       * 2페이지부터 마지막 페이지까지
       */
      pageNo = 2;

      while (pageNo <= totalPages) {
        const params = {
          divId: 'ctprvnCd',
          key: '11',

          indsLclsCd: category.largeCode,
          indsMclsCd: category.middleCode,

          /*
           * 첫 페이지에서 실제로 받은 크기로
           * 이후 요청 크기도 맞춘다.
           */
          numOfRows: actualPageSize,
          pageNo,
        };

        const data = await this.request(
          'storeListInDong',
          params,
        );

        const items =
          this.extractItems(data);

        if (items.length === 0) {
          console.warn(
            `[SmallBusiness] ${category.middleCode} ` +
              `page ${pageNo}/${totalPages} returned 0 items`,
          );

          pageNo++;
          continue;
        }

        await this.prisma.rawSmallBusinessApi.createMany({
          data: items.map((item) => ({
            sourceId: source.id,
            endpoint: 'storeListInDong',

            businessId: item.bizesId
              ? String(item.bizesId)
              : null,

            requestPayload: params,
            responsePayload: item,

            sourceChangeType: null,
            sourceChangeDate: null,
          })),
        });

        fetchedCount += items.length;
        insertedCount += items.length;

        totalFetched += items.length;
        totalInserted += items.length;

        console.log(
          `[SmallBusiness] ${category.middleCode} ` +
            `${category.name} ` +
            `page ${pageNo}/${totalPages} ` +
            `(${items.length} items)`,
        );

        pageNo++;
      }

      categoryResults.push({
        ...category,
        totalCount,
        fetchedCount,
        insertedCount,
        totalPages,
      });

      console.log(
        `[SmallBusiness] completed ` +
          `${category.middleCode} ${category.name}: ` +
          `${insertedCount}/${totalCount}`,
      );
    }

    return {
      city: {
        code: '11',
        name: '서울특별시',
      },

      selectedCategoryCount:
        this.selectedCategories.length,

      totalExpected,
      totalFetched,
      totalInserted,

      categories: categoryResults,
    };
  }
}