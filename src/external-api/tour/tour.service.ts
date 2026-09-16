import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

import {
  execFile,
} from 'node:child_process';

import {
  promisify,
} from 'node:util';

const execFileAsync =
  promisify(execFile);


type PreparedTourDetailRaw = {
  placeId: bigint;
  contentId: string;
  contentTypeId: string | null;
  sourceModifiedAt: Date;
  requestPayload: Record<string, any>;
  responsePayload: any;
};

type PreparedTourDetailRefresh = {
  common: PreparedTourDetailRaw[];
  intro: PreparedTourDetailRaw[];

  mappedActiveCount: number;
  commonTargetCount: number;
  introTargetCount: number;
};

type TourSyncPreparedItem = {
  contentId: string;
  contentTypeId: string | null;
  modifiedTime: string | null;
  showflag: '0' | '1';
  payload: Record<string, any>;
};

type PreparedSeoulTourIncrementalSync = {
  months: string[];
  fetchedCount: number;
  activeCount: number;
  inactiveCount: number;
  duplicateContentIds: string[];
  mappedActiveCount: number;
  mappedInactiveCount: number;
  unmappedActiveCount: number;
  unmappedInactiveCount: number;
  unmappedActiveSample: string[];
  unmappedInactiveSample: string[];
  activeItems: TourSyncPreparedItem[];
  inactiveItems: TourSyncPreparedItem[];
};

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
  private normalizeHomepage(
    value?: string | null,
  ): string | null {
    if (!value) {
      return null;
    }

    const raw = value.trim();

    if (!raw) {
      return null;
    }

    const hrefMatch = raw.match(
      /href\s*=\s*["']([^"']+)["']/i,
    );

    if (hrefMatch?.[1]) {
      return hrefMatch[1].trim();
    }

    const urlMatch = raw.match(
      /https?:\/\/[^\s<>"']+/i,
    );

    if (urlMatch?.[0]) {
      return urlMatch[0].trim();
    }

    return null;
  }
  private async syncTourLclsMappingsFromRaw(): Promise<{
    mappedPlaces: number;
    mappingRows: number;
  }> {
    const source = await this.getTourApiSource();

    const categories =
      await this.prisma.externalCategory.findMany({
        where: {
          sourceId: source.id,
          scheme: 'TOUR_LCLS',
        },
        select: {
          id: true,
          level: true,
          externalCode: true,
        },
      });

    const categoryMap = new Map<string, bigint>();

    for (const category of categories) {
      categoryMap.set(
        `${category.level}:${category.externalCode}`,
        category.id,
      );
    }

    const raws =
      await this.prisma.rawTourApi.findMany({
        where: {
          sourceId: source.id,
          endpoint: 'areaBasedList2',
          contentId: {
            not: null,
          },
        },
        orderBy: [
          {
            contentId: 'asc',
          },
          {
            fetchedAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: {
          contentId: true,
          responsePayload: true,
        },
      });

    const latestByContentId =
      new Map<string, Record<string, any>>();

    for (const raw of raws) {
      if (!raw.contentId) {
        continue;
      }

      if (latestByContentId.has(raw.contentId)) {
        continue;
      }

      latestByContentId.set(
        raw.contentId,
        raw.responsePayload as Record<string, any>,
      );
    }

    const externalIds =
      await this.prisma.placeExternalId.findMany({
        where: {
          sourceId: source.id,
          idType: 'CONTENT_ID',
        },
        select: {
          placeId: true,
          externalId: true,
        },
      });

    const placeByContentId =
      new Map<string, bigint>();

    for (const row of externalIds) {
      placeByContentId.set(
        row.externalId,
        row.placeId,
      );
    }

    const mappings: {
      placeId: bigint;
      externalCategoryId: bigint;
    }[] = [];

    const mappedPlaceIds =
      new Set<string>();

    for (const [contentId, payload] of latestByContentId) {
      const placeId =
        placeByContentId.get(contentId);

      if (!placeId) {
        continue;
      }

      const codes = [
        {
          level: 1,
          code: payload.lclsSystm1,
        },
        {
          level: 2,
          code: payload.lclsSystm2,
        },
        {
          level: 3,
          code: payload.lclsSystm3,
        },
      ];

      for (const item of codes) {
        const code =
          item.code == null
            ? ''
            : String(item.code).trim();

        if (!code) {
          continue;
        }

        const externalCategoryId =
          categoryMap.get(
            `${item.level}:${code}`,
          );

        if (!externalCategoryId) {
          throw new Error(
            `Unknown TOUR_LCLS code: ` +
            `level=${item.level}, ` +
            `code=${code}, ` +
            `contentId=${contentId}`,
          );
        }

        mappings.push({
          placeId,
          externalCategoryId,
        });

        mappedPlaceIds.add(
          placeId.toString(),
        );
      }
    }

    await this.prisma.placeExternalCategory.deleteMany({
      where: {
        externalCategory: {
          sourceId: source.id,
          scheme: 'TOUR_LCLS',
        },
      },
    });

    if (mappings.length > 0) {
      await this.prisma.placeExternalCategory.createMany({
        data: mappings,
        skipDuplicates: true,
      });
    }

    return {
      mappedPlaces: mappedPlaceIds.size,
      mappingRows: mappings.length,
    };
  }

  private formatKstYm(date: Date): string {
    const parts =
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(date);

    const year =
      parts.find((part) => part.type === 'year')
        ?.value;

    const month =
      parts.find((part) => part.type === 'month')
        ?.value;

    if (!year || !month) {
      throw new Error(
        'Failed to format Asia/Seoul year-month',
      );
    }

    return `${year}${month}`;
  }

  private enumerateYearMonths(
    startYm: string,
    endYm: string,
  ): string[] {
    if (
      !/^\d{6}$/.test(startYm) ||
      !/^\d{6}$/.test(endYm)
    ) {
      throw new Error(
        `Invalid year-month range: ${startYm}..${endYm}`,
      );
    }

    const startYear =
      Number(startYm.slice(0, 4));
    const startMonth =
      Number(startYm.slice(4, 6));

    const endYear =
      Number(endYm.slice(0, 4));
    const endMonth =
      Number(endYm.slice(4, 6));

    const current =
      new Date(
        Date.UTC(
          startYear,
          startMonth - 1,
          1,
        ),
      );

    const end =
      new Date(
        Date.UTC(
          endYear,
          endMonth - 1,
          1,
        ),
      );

    if (current.getTime() > end.getTime()) {
      throw new Error(
        `startYm is after endYm: ${startYm} > ${endYm}`,
      );
    }

    const months: string[] = [];

    while (
      current.getTime() <= end.getTime()
    ) {
      months.push(
        `${current.getUTCFullYear()}` +
          `${String(
            current.getUTCMonth() + 1,
          ).padStart(2, '0')}`,
      );

      current.setUTCMonth(
        current.getUTCMonth() + 1,
      );

      if (months.length > 24) {
        throw new Error(
          'TourAPI incremental period is unexpectedly long',
        );
      }
    }

    return months;
  }

  private async getTourIncrementalStartYm(
    sourceId: bigint,
  ): Promise<string> {
    const latestSuccess =
      await this.prisma.externalSyncRun.findFirst({
        where: {
          sourceId,
          endpoint:
            'areaBasedSyncList2:seoul',
          syncType:
            'INCREMENTAL',
          status:
            'SUCCESS',
        },
        orderBy: {
          finishedAt: 'desc',
        },
        select: {
          startedAt: true,
        },
      });

    if (latestSuccess) {
      return this.formatKstYm(
        latestSuccess.startedAt,
      );
    }

    /*
     * 아직 incremental SUCCESS 기록이 없는
     * 초기 전환 시에는 기존 areaBasedList2
     * bootstrap의 마지막 수집 시점을 기준으로 한다.
     */
    const latestBootstrap =
      await this.prisma.rawTourApi.findFirst({
        where: {
          sourceId,
          endpoint:
            'areaBasedList2',
        },
        orderBy: {
          fetchedAt: 'desc',
        },
        select: {
          fetchedAt: true,
        },
      });

    if (!latestBootstrap) {
      throw new Error(
        'Cannot determine TourAPI incremental start month: ' +
          'no SUCCESS run and no areaBasedList2 bootstrap RAW',
      );
    }

    return this.formatKstYm(
      latestBootstrap.fetchedAt,
    );
  }

  private async fetchSeoulSyncListForMonth(
    modifiedtime: string,
    showflag: '0' | '1',
  ): Promise<TourSyncPreparedItem[]> {
    if (!/^\d{6}$/.test(modifiedtime)) {
      throw new Error(
        `Invalid TourAPI modifiedtime month: ${modifiedtime}`,
      );
    }

    const numOfRows = 1000;

    let pageNo = 1;
    let totalCount = 0;
    let totalPages = 1;

    const result: TourSyncPreparedItem[] =
      [];

    do {
      const params = {
        numOfRows,
        pageNo,
        showflag,
        modifiedtime,
        arrange: 'C',

        /*
         * TourAPI 4.4의 서울 법정동 시도 코드.
         */
        lDongRegnCd: '11',
      };

      const data =
        await this.request(
          'areaBasedSyncList2',
          params,
        );

      const resultCode =
        data?.response?.header?.resultCode;

      if (
        resultCode &&
        String(resultCode) !== '0000'
      ) {
        throw new Error(
          `TourAPI areaBasedSyncList2 failed: ` +
            `${String(resultCode)} ` +
            `${String(
              data?.response?.header
                ?.resultMsg ?? '',
            )}`,
        );
      }

      const items =
        this.extractItems(data);

      if (pageNo === 1) {
        totalCount =
          Number(
            data?.response?.body
              ?.totalCount ?? 0,
          );

        totalPages =
          Math.max(
            1,
            Math.ceil(
              totalCount /
                numOfRows,
            ),
          );
      }

      for (const item of items) {
        const contentId =
          item?.contentid != null
            ? String(
                item.contentid,
              ).trim()
            : '';

        if (!contentId) {
          throw new Error(
            `TourAPI areaBasedSyncList2 returned item without contentid: ` +
              JSON.stringify(item),
          );
        }

        result.push({
          contentId,

          contentTypeId:
            item?.contenttypeid != null
              ? String(
                  item.contenttypeid,
                )
              : null,

          modifiedTime:
            item?.modifiedtime != null
              ? String(
                  item.modifiedtime,
                )
              : null,

          showflag,

          payload:
            item as Record<
              string,
              any
            >,
        });
      }

      pageNo++;
    } while (
      pageNo <= totalPages
    );

    return result;
  }

  private dedupeTourSyncItems(
    items: TourSyncPreparedItem[],
  ): TourSyncPreparedItem[] {
    const latest =
      new Map<
        string,
        TourSyncPreparedItem
      >();

    for (const item of items) {
      const previous =
        latest.get(
          item.contentId,
        );

      if (!previous) {
        latest.set(
          item.contentId,
          item,
        );

        continue;
      }

      const previousModified =
        previous.modifiedTime ?? '';

      const currentModified =
        item.modifiedTime ?? '';

      if (
        currentModified >=
        previousModified
      ) {
        latest.set(
          item.contentId,
          item,
        );
      }
    }

    return [
      ...latest.values(),
    ];
  }

  /**
   * TourAPI 공식 증분 endpoint인
   * areaBasedSyncList2를 사용해
   * 서울 변경분을 수집만 한다.
   *
   * DB mutation 없음.
   */
  async prepareSeoulIncrementalSync(
    startYm?: string,
  ): Promise<PreparedSeoulTourIncrementalSync> {
    const source =
      await this.getTourApiSource();

    const currentYm =
      this.formatKstYm(
        new Date(),
      );

    const actualStartYm =
      startYm ??
      (await this.getTourIncrementalStartYm(
        source.id,
      ));

    if (
      !/^\d{6}$/.test(
        actualStartYm,
      )
    ) {
      throw new Error(
        `Invalid TourAPI incremental startYm: ${actualStartYm}`,
      );
    }

    const months =
      this.enumerateYearMonths(
        actualStartYm,
        currentYm,
      );

    const activeRaw:
      TourSyncPreparedItem[] =
      [];

    const inactiveRaw:
      TourSyncPreparedItem[] =
      [];

    /*
     * API 호출은 DB mutation보다 먼저 완료한다.
     */
    for (const month of months) {
      const [
        active,
        inactive,
      ] = await Promise.all([
        this.fetchSeoulSyncListForMonth(
          month,
          '1',
        ),

        this.fetchSeoulSyncListForMonth(
          month,
          '0',
        ),
      ]);

      activeRaw.push(
        ...active,
      );

      inactiveRaw.push(
        ...inactive,
      );
    }

    const activeItems =
      this.dedupeTourSyncItems(
        activeRaw,
      );

    const inactiveItems =
      this.dedupeTourSyncItems(
        inactiveRaw,
      );

    const activeIds =
      new Set(
        activeItems.map(
          (item) =>
            item.contentId,
        ),
      );

    const duplicateContentIds =
      inactiveItems
        .filter((item) =>
          activeIds.has(
            item.contentId,
          ),
        )
        .map(
          (item) =>
            item.contentId,
        );

    const allIds = [
      ...new Set([
        ...activeItems.map(
          (item) =>
            item.contentId,
        ),

        ...inactiveItems.map(
          (item) =>
            item.contentId,
        ),
      ]),
    ];

    const mappings =
      allIds.length === 0
        ? []
        : await this.prisma
            .placeExternalId
            .findMany({
              where: {
                sourceId:
                  source.id,

                idType:
                  'CONTENT_ID',

                externalId: {
                  in: allIds,
                },
              },

              select: {
                externalId:
                  true,
              },
            });

    const mappedIds =
      new Set(
        mappings.map(
          (row) =>
            row.externalId,
        ),
      );

    const mappedActiveCount =
      activeItems.filter(
        (item) =>
          mappedIds.has(
            item.contentId,
          ),
      ).length;

    const mappedInactiveCount =
      inactiveItems.filter(
        (item) =>
          mappedIds.has(
            item.contentId,
          ),
      ).length;

    const unmappedActive =
      activeItems.filter(
        (item) =>
          !mappedIds.has(
            item.contentId,
          ),
      );

    const unmappedInactive =
      inactiveItems.filter(
        (item) =>
          !mappedIds.has(
            item.contentId,
          ),
      );

    return {
      months,

      fetchedCount:
        activeRaw.length +
        inactiveRaw.length,

      activeCount:
        activeItems.length,

      inactiveCount:
        inactiveItems.length,

      duplicateContentIds,

      mappedActiveCount,
      mappedInactiveCount,

      unmappedActiveCount:
        unmappedActive.length,

      unmappedInactiveCount:
        unmappedInactive.length,

      unmappedActiveSample:
        unmappedActive
          .slice(0, 20)
          .map(
            (item) =>
              item.contentId,
          ),

      unmappedInactiveSample:
        unmappedInactive
          .slice(0, 20)
          .map(
            (item) =>
              item.contentId,
          ),

      activeItems,
      inactiveItems,
    };
  }

  /**
   * prepareSeoulIncrementalSync() 결과를 DB에 반영한다.
   *
   * 원칙:
   * - 신규/unmapped contentId로 Place를 임의 생성하지 않는다.
   * - showflag=0이어도 Place 자체를 삭제/비활성화하지 않는다.
   * - 기존 place_external_ids 연결은 유지한다.
   * - areaBasedSyncList2 RAW는 sourceModifiedAt 기준 중복 저장을 피한다.
   * - 기존 mapped ACTIVE 장소의 TOUR_LCLS 매핑만 최신 값으로 교체한다.
   * - 전체 TOUR_LCLS를 delete하지 않는다.
   */
  async applyPreparedSeoulIncrementalSync(
    prepared: PreparedSeoulTourIncrementalSync,
  ) {
    if (
      prepared.duplicateContentIds.length > 0
    ) {
      throw new Error(
        `TourAPI sync contains contentIds in both active/inactive sets: ` +
          prepared.duplicateContentIds.join(', '),
      );
    }

    const source =
      await this.getTourApiSource();

    const allItems = [
      ...prepared.activeItems,
      ...prepared.inactiveItems,
    ];

    const allContentIds = [
      ...new Set(
        allItems.map(
          (item) => item.contentId,
        ),
      ),
    ];

    const externalIds =
      allContentIds.length === 0
        ? []
        : await this.prisma
            .placeExternalId
            .findMany({
              where: {
                sourceId: source.id,
                idType: 'CONTENT_ID',
                externalId: {
                  in: allContentIds,
                },
              },
              select: {
                id: true,
                placeId: true,
                externalId: true,
              },
            });

    const placeByContentId =
      new Map<string, bigint>();

    for (const row of externalIds) {
      placeByContentId.set(
        row.externalId,
        row.placeId,
      );
    }

    /*
     * ACTIVE + mapped인 장소만 category를 갱신한다.
     * inactive/unmapped 연결은 파괴하지 않는다.
     */
    const mappedActiveItems =
      prepared.activeItems.filter(
        (item) =>
          placeByContentId.has(
            item.contentId,
          ),
      );

    const categories =
      await this.prisma.externalCategory.findMany({
        where: {
          sourceId: source.id,
          scheme: 'TOUR_LCLS',
        },
        select: {
          id: true,
          level: true,
          externalCode: true,
        },
      });

    const categoryByCode =
      new Map<string, bigint>();

    for (const category of categories) {
      categoryByCode.set(
        `${category.level}:${category.externalCode}`,
        category.id,
      );
    }

    /*
     * DB mutation 전에 모든 LCLS 코드를 검증한다.
     */
    const preparedCategoryMappings:
      Array<{
        placeId: bigint;
        externalCategoryIds: bigint[];
      }> = [];

    for (const item of mappedActiveItems) {
      const placeId =
        placeByContentId.get(
          item.contentId,
        )!;

      const codes = [
        {
          level: 1,
          code:
            item.payload
              ?.lclsSystm1,
        },
        {
          level: 2,
          code:
            item.payload
              ?.lclsSystm2,
        },
        {
          level: 3,
          code:
            item.payload
              ?.lclsSystm3,
        },
      ];

      const externalCategoryIds:
        bigint[] = [];

      for (const row of codes) {
        const code =
          row.code == null
            ? ''
            : String(
                row.code,
              ).trim();

        if (!code) {
          continue;
        }

        const externalCategoryId =
          categoryByCode.get(
            `${row.level}:${code}`,
          );

        if (!externalCategoryId) {
          throw new Error(
            `Unknown TOUR_LCLS code before DB mutation: ` +
              `level=${row.level}, ` +
              `code=${code}, ` +
              `contentId=${item.contentId}`,
          );
        }

        externalCategoryIds.push(
          externalCategoryId,
        );
      }

      preparedCategoryMappings.push({
        placeId,
        externalCategoryIds,
      });
    }

    const now = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        let rawInsertedCount = 0;
        let rawSkippedCount = 0;
        let externalIdTouchedCount = 0;
        let categoryMappedPlaceCount = 0;
        let categoryRowCount = 0;

        /*
         * 1. 증분 API RAW 저장
         */
        for (const item of allItems) {
          const sourceModifiedAt =
            this.parseTourDateTime(
              item.modifiedTime ??
                undefined,
            );

          const existing =
            await tx.rawTourApi.findFirst({
              where: {
                sourceId: source.id,
                endpoint:
                  'areaBasedSyncList2',
                contentId:
                  item.contentId,

                ...(sourceModifiedAt
                  ? {
                      sourceModifiedAt,
                    }
                  : {}),
              },
              select: {
                id: true,
              },
            });

          if (existing) {
            rawSkippedCount++;
          } else {
            await tx.rawTourApi.create({
              data: {
                sourceId:
                  source.id,

                endpoint:
                  'areaBasedSyncList2',

                contentId:
                  item.contentId,

                contentTypeId:
                  item.contentTypeId,

                requestPayload: {
                  showflag:
                    item.showflag,

                  modifiedtime:
                    item.modifiedTime
                      ?.slice(0, 6) ??
                    null,

                  lDongRegnCd:
                    '11',

                  arrange:
                    'C',
                },

                responsePayload:
                  item.payload,

                sourceModifiedAt,
              },
            });

            rawInsertedCount++;
          }
        }

        /*
         * 2. 기존 external-id 연결의 lastSeenAt만 갱신.
         *
         * 신규 contentId는 여기서 Place를 만들지 않는다.
         */
        for (const row of externalIds) {
          await tx.placeExternalId.update({
            where: {
              id: row.id,
            },
            data: {
              lastSeenAt:
                now,
            },
          });

          externalIdTouchedCount++;
        }

        /*
         * 3. 변경된 ACTIVE 기존 장소에 대해서만
         *    TOUR_LCLS mapping을 place 단위로 교체.
         *
         * 기존 구현처럼 전체 TOUR_LCLS를 삭제하지 않는다.
         */
        for (
          const mapping
          of preparedCategoryMappings
        ) {
          await tx.placeExternalCategory.deleteMany({
            where: {
              placeId:
                mapping.placeId,

              externalCategory: {
                sourceId:
                  source.id,
                scheme:
                  'TOUR_LCLS',
              },
            },
          });

          if (
            mapping.externalCategoryIds
              .length > 0
          ) {
            await tx.placeExternalCategory.createMany({
              data:
                mapping.externalCategoryIds.map(
                  (
                    externalCategoryId,
                  ) => ({
                    placeId:
                      mapping.placeId,

                    externalCategoryId,
                  }),
                ),

              skipDuplicates:
                true,
            });
          }

          categoryMappedPlaceCount++;

          categoryRowCount +=
            mapping
              .externalCategoryIds
              .length;
        }

        /*
         * 4. 간단한 post-validation
         */
        const rawCount =
          await tx.rawTourApi.count({
            where: {
              sourceId:
                source.id,

              endpoint:
                'areaBasedSyncList2',

              contentId: {
                in:
                  allContentIds.length > 0
                    ? allContentIds
                    : ['__NO_CONTENT__'],
              },
            },
          });

        if (
          allContentIds.length > 0 &&
          rawCount <
            allContentIds.length
        ) {
          throw new Error(
            `TourAPI post-validation failed: ` +
              `raw=${rawCount}, ` +
              `expectedAtLeast=${allContentIds.length}`,
          );
        }

        return {
          fetchedCount:
            prepared.fetchedCount,

          activeCount:
            prepared.activeCount,

          inactiveCount:
            prepared.inactiveCount,

          mappedActiveCount:
            prepared.mappedActiveCount,

          mappedInactiveCount:
            prepared.mappedInactiveCount,

          unmappedActiveCount:
            prepared.unmappedActiveCount,

          unmappedInactiveCount:
            prepared.unmappedInactiveCount,

          rawInsertedCount,
          rawSkippedCount,

          externalIdTouchedCount,

          categoryMappedPlaceCount,
          categoryRowCount,
        };
      },
      {
        maxWait:
          10_000,
        timeout:
          60_000,
      },
    );
  }

  /**
   * TourAPI 서울 증분 동기화.
   *
   * API fetch/validation은 transaction 밖,
   * 실제 DB mutation만 짧은 transaction에서 수행.
   */
  async syncSeoulIncremental(
    startYm?: string,
  ) {
    const prepared =
      await this.prepareSeoulIncrementalSync(
        startYm,
      );

    const result =
      await this.applyPreparedSeoulIncrementalSync(
        prepared,
      );

    return {
      months:
        prepared.months,

      ...result,

      unmappedActiveSample:
        prepared.unmappedActiveSample,

      unmappedInactiveSample:
        prepared.unmappedInactiveSample,
    };
  }

  private assertTourApiSuccess(
    data: any,
    endpoint: string,
    contentId: string,
  ) {
    const resultCode =
      data?.response?.header?.resultCode;

    if (
      resultCode != null &&
      String(resultCode) !== '0000'
    ) {
      throw new Error(
        `${endpoint} failed for contentId=${contentId}: ` +
          `${String(resultCode)} ` +
          `${String(
            data?.response?.header?.resultMsg ?? '',
          )}`,
      );
    }
  }

  /**
   * 최신 areaBasedSyncList2 ACTIVE 변경 중
   * 기존 Place와 연결되어 있는 장소만 대상으로
   * stale detailCommon2 / detailIntro2를 API에서 준비한다.
   *
   * DB mutation 없음.
   */
  async prepareSeoulIncrementalDetailRefresh():
    Promise<PreparedTourDetailRefresh> {
    const source =
      await this.getTourApiSource();

    const latestSyncRows:
      Array<{
        contentId: string;
        contentTypeId: string | null;
        sourceModifiedAt: Date;
        placeId: bigint;
      }> =
      await this.prisma.$queryRaw`
        WITH latest_sync AS (
          SELECT DISTINCT ON (r.content_id)
            r.content_id,
            r.content_type_id,
            r.source_modified_at
          FROM raw_tour_api r
          WHERE r.source_id = ${source.id}
            AND r.endpoint =
              'areaBasedSyncList2'
            AND r.response_payload->>'showflag'
              = '1'
            AND r.content_id IS NOT NULL
            AND r.source_modified_at IS NOT NULL
          ORDER BY
            r.content_id,
            r.source_modified_at DESC,
            r.fetched_at DESC,
            r.id DESC
        )
        SELECT
          ls.content_id AS "contentId",
          ls.content_type_id AS "contentTypeId",
          ls.source_modified_at AS "sourceModifiedAt",
          pei.place_id AS "placeId"
        FROM latest_sync ls
        JOIN place_external_ids pei
          ON pei.source_id = ${source.id}
         AND pei.id_type = 'CONTENT_ID'
         AND pei.external_id = ls.content_id
        ORDER BY
          ls.source_modified_at,
          ls.content_id
      `;

    const commonPrepared:
      PreparedTourDetailRaw[] = [];

    const introPrepared:
      PreparedTourDetailRaw[] = [];

    for (const target of latestSyncRows) {
      /*
       * -----------------------------
       * detailCommon2 freshness
       * -----------------------------
       */
      const latestCommon =
        await this.prisma.rawTourApi.findFirst({
          where: {
            sourceId:
              source.id,

            endpoint:
              'detailCommon2',

            contentId:
              target.contentId,

            sourceModifiedAt: {
              not: null,
            },
          },

          orderBy: [
            {
              sourceModifiedAt:
                'desc',
            },
            {
              fetchedAt:
                'desc',
            },
            {
              id:
                'desc',
            },
          ],

          select: {
            sourceModifiedAt:
              true,
          },
        });

      const commonNeedsRefresh =
        !latestCommon?.sourceModifiedAt ||
        latestCommon.sourceModifiedAt.getTime() <
          target.sourceModifiedAt.getTime();

      if (commonNeedsRefresh) {
        const params = {
          contentId:
            target.contentId,
          numOfRows: 1,
          pageNo: 1,
        };

        const data =
          await this.request(
            'detailCommon2',
            params,
          );

        this.assertTourApiSuccess(
          data,
          'detailCommon2',
          target.contentId,
        );

        const items =
          this.extractDetailCommonItems(
            data,
          );

        if (items.length === 0) {
          throw new Error(
            `detailCommon2 returned no items: ` +
              `contentId=${target.contentId}`,
          );
        }

        const item =
          items[0];

        const apiModifiedAt =
          this.parseTourDateTime(
            item?.modifiedtime
              ? String(
                  item.modifiedtime,
                )
              : undefined,
          );

        commonPrepared.push({
          placeId:
            target.placeId,

          contentId:
            target.contentId,

          contentTypeId:
            item?.contenttypeid != null
              ? String(
                  item.contenttypeid,
                )
              : target.contentTypeId,

          /*
           * detailCommon2 자체 수정시각을 우선하고,
           * 없으면 sync event의 수정시각을 사용.
           */
          sourceModifiedAt:
            apiModifiedAt ??
            target.sourceModifiedAt,

          requestPayload:
            params,

          /*
           * 기존 detailCommon2 RAW 형식과 동일하게
           * item 자체를 저장.
           */
          responsePayload:
            item,
        });
      }

      /*
       * -----------------------------
       * detailIntro2 freshness
       * -----------------------------
       *
       * 기존 Python 수집 RAW는
       * source_modified_at이 NULL이므로
       * 첫 incremental 전환 시 refresh 대상이 된다.
       */
      const latestIntro =
        await this.prisma.rawTourApi.findFirst({
          where: {
            sourceId:
              source.id,

            endpoint:
              'detailIntro2',

            contentId:
              target.contentId,

            sourceModifiedAt: {
              not: null,
            },
          },

          orderBy: [
            {
              sourceModifiedAt:
                'desc',
            },
            {
              fetchedAt:
                'desc',
            },
            {
              id:
                'desc',
            },
          ],

          select: {
            sourceModifiedAt:
              true,
          },
        });

      const introNeedsRefresh =
        !latestIntro?.sourceModifiedAt ||
        latestIntro.sourceModifiedAt.getTime() <
          target.sourceModifiedAt.getTime();

      if (introNeedsRefresh) {
        if (!target.contentTypeId) {
          throw new Error(
            `detailIntro2 requires contentTypeId: ` +
              `contentId=${target.contentId}`,
          );
        }

        const params = {
          contentId:
            target.contentId,

          contentTypeId:
            target.contentTypeId,

          numOfRows:
            10,

          pageNo:
            1,
        };

        const data =
          await this.request(
            'detailIntro2',
            params,
          );

        this.assertTourApiSuccess(
          data,
          'detailIntro2',
          target.contentId,
        );

        /*
         * detailIntro2는 totalCount=0도
         * 정상적인 수집 결과로 취급한다.
         *
         * 기존 Python collector와 동일한 정책.
         */
        introPrepared.push({
          placeId:
            target.placeId,

          contentId:
            target.contentId,

          contentTypeId:
            target.contentTypeId,

          sourceModifiedAt:
            target.sourceModifiedAt,

          requestPayload:
            params,

          /*
           * operating-hours normalizer가
           * response.body.items를 읽으므로
           * 전체 API response를 저장해야 한다.
           */
          responsePayload:
            data,
        });
      }
    }

    return {
      common:
        commonPrepared,

      intro:
        introPrepared,

      mappedActiveCount:
        latestSyncRows.length,

      commonTargetCount:
        commonPrepared.length,

      introTargetCount:
        introPrepared.length,
    };
  }

  async applyPreparedSeoulDetailRefresh(
    prepared: PreparedTourDetailRefresh,
  ) {
    const source =
      await this.getTourApiSource();

    return this.prisma.$transaction(
      async (tx) => {
        let commonInsertedCount =
          0;

        let introInsertedCount =
          0;

        let homepageUpdatedCount =
          0;

        /*
         * detailCommon2 RAW + homepage
         */
        for (
          const item
          of prepared.common
        ) {
          const existing =
            await tx.rawTourApi.findFirst({
              where: {
                sourceId:
                  source.id,

                endpoint:
                  'detailCommon2',

                contentId:
                  item.contentId,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
              select: {
                id: true,
              },
            });

          if (!existing) {
            await tx.rawTourApi.create({
              data: {
                sourceId:
                  source.id,

                endpoint:
                  'detailCommon2',

                contentId:
                  item.contentId,

                contentTypeId:
                  item.contentTypeId,

                requestPayload:
                  item.requestPayload,

                responsePayload:
                  item.responsePayload,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
            });

            commonInsertedCount++;
          }

          const payload =
            item.responsePayload as Record<
              string,
              any
            >;

          const homepage =
            this.normalizeHomepage(
              payload?.homepage != null
                ? String(
                    payload.homepage,
                  )
                : null,
            );

          if (homepage) {
            const updated =
              await tx.place.updateMany({
                where: {
                  id:
                    item.placeId,

                  NOT: {
                    ownerLockedFields: {
                      has:
                        'homepage',
                    },
                  },

                  OR: [
                    {
                      homepage: null,
                    },
                    {
                      homepage: {
                        not:
                          homepage,
                      },
                    },
                  ],
                },

                data: {
                  homepage,
                  updatedAt:
                    new Date(),
                },
              });

            homepageUpdatedCount +=
              updated.count;
          }
        }

        /*
         * detailIntro2 RAW
         *
         * 기존 연결/운영시간 사용자 수정 row는
         * 여기서 건드리지 않는다.
         */
        for (
          const item
          of prepared.intro
        ) {
          const existing =
            await tx.rawTourApi.findFirst({
              where: {
                sourceId:
                  source.id,

                endpoint:
                  'detailIntro2',

                contentId:
                  item.contentId,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
              select: {
                id: true,
              },
            });

          if (!existing) {
            await tx.rawTourApi.create({
              data: {
                sourceId:
                  source.id,

                endpoint:
                  'detailIntro2',

                contentId:
                  item.contentId,

                contentTypeId:
                  item.contentTypeId,

                requestPayload:
                  item.requestPayload,

                responsePayload:
                  item.responsePayload,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
            });

            introInsertedCount++;
          }
        }

        /*
         * post-validation:
         * 준비된 각 대상의 source_modified_at RAW가
         * 실제 DB에 존재해야 한다.
         */
        for (
          const item
          of prepared.common
        ) {
          const count =
            await tx.rawTourApi.count({
              where: {
                sourceId:
                  source.id,

                endpoint:
                  'detailCommon2',

                contentId:
                  item.contentId,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
            });

          if (count < 1) {
            throw new Error(
              `detailCommon2 post-validation failed: ` +
                `contentId=${item.contentId}`,
            );
          }
        }

        for (
          const item
          of prepared.intro
        ) {
          const count =
            await tx.rawTourApi.count({
              where: {
                sourceId:
                  source.id,

                endpoint:
                  'detailIntro2',

                contentId:
                  item.contentId,

                sourceModifiedAt:
                  item.sourceModifiedAt,
              },
            });

          if (count < 1) {
            throw new Error(
              `detailIntro2 post-validation failed: ` +
                `contentId=${item.contentId}`,
            );
          }
        }

        return {
          mappedActiveCount:
            prepared.mappedActiveCount,

          commonTargetCount:
            prepared.commonTargetCount,

          introTargetCount:
            prepared.introTargetCount,

          commonInsertedCount,
          introInsertedCount,
          homepageUpdatedCount,
        };
      },
      {
        maxWait:
          10_000,
        timeout:
          60_000,
      },
    );
  }

  async refreshSeoulIncrementalDetails(
    maxApiCalls = 850,
  ) {
    if (
      !Number.isInteger(maxApiCalls) ||
      maxApiCalls < 0
    ) {
      throw new Error(
        `Invalid TourAPI detail call budget: ${maxApiCalls}`,
      );
    }

    const source =
      await this.getTourApiSource();

    /*
     * 최신 areaBasedSyncList2 중
     * showflag=1 + 기존 Place에 매핑된 장소만.
     *
     * showflag=0은 detail refresh하지 않는다.
     */
    const latestSyncRows:
      Array<{
        contentId: string;
        contentTypeId: string | null;
        sourceModifiedAt: Date;
        placeId: bigint;
      }> =
      await this.prisma.$queryRaw`
        WITH latest_sync AS (
          SELECT DISTINCT ON (r.content_id)
            r.content_id,
            r.content_type_id,
            r.source_modified_at

          FROM raw_tour_api r

          WHERE
            r.source_id = ${source.id}
            AND r.endpoint =
                'areaBasedSyncList2'
            AND r.response_payload->>'showflag'
                = '1'
            AND r.content_id IS NOT NULL
            AND r.source_modified_at IS NOT NULL

          ORDER BY
            r.content_id,
            r.source_modified_at DESC,
            r.fetched_at DESC,
            r.id DESC
        )

        SELECT
          ls.content_id AS "contentId",
          ls.content_type_id AS "contentTypeId",
          ls.source_modified_at AS "sourceModifiedAt",
          pei.place_id AS "placeId"

        FROM latest_sync ls

        JOIN place_external_ids pei
          ON pei.source_id = ${source.id}
         AND pei.id_type = 'CONTENT_ID'
         AND pei.external_id = ls.content_id

        ORDER BY
          ls.source_modified_at,
          ls.content_id
      `;

    /*
     * API 호출 전에 DB freshness만 확인한다.
     */
    const targets:
      Array<{
        placeId: bigint;
        contentId: string;
        contentTypeId: string | null;
        sourceModifiedAt: Date;
        commonNeedsRefresh: boolean;
        introNeedsRefresh: boolean;
      }> = [];

    let commonTargetCount =
      0;

    let introTargetCount =
      0;

    let skippedFreshCount =
      0;

    for (
      const target
      of latestSyncRows
    ) {
      const [
        latestCommon,
        latestIntro,
      ] =
        await Promise.all([
          this.prisma.rawTourApi.findFirst({
            where: {
              sourceId:
                source.id,

              endpoint:
                'detailCommon2',

              contentId:
                target.contentId,

              sourceModifiedAt: {
                not: null,
              },
            },

            orderBy: [
              {
                sourceModifiedAt:
                  'desc',
              },
              {
                fetchedAt:
                  'desc',
              },
              {
                id:
                  'desc',
              },
            ],

            select: {
              sourceModifiedAt:
                true,
            },
          }),

          this.prisma.rawTourApi.findFirst({
            where: {
              sourceId:
                source.id,

              endpoint:
                'detailIntro2',

              contentId:
                target.contentId,

              sourceModifiedAt: {
                not: null,
              },
            },

            orderBy: [
              {
                sourceModifiedAt:
                  'desc',
              },
              {
                fetchedAt:
                  'desc',
              },
              {
                id:
                  'desc',
              },
            ],

            select: {
              sourceModifiedAt:
                true,
            },
          }),
        ]);

      const commonNeedsRefresh =
        !latestCommon?.sourceModifiedAt ||
        latestCommon.sourceModifiedAt.getTime() <
          target.sourceModifiedAt.getTime();

      const introNeedsRefresh =
        !latestIntro?.sourceModifiedAt ||
        latestIntro.sourceModifiedAt.getTime() <
          target.sourceModifiedAt.getTime();

      if (commonNeedsRefresh) {
        commonTargetCount++;
      }

      if (introNeedsRefresh) {
        introTargetCount++;
      }

      if (
        !commonNeedsRefresh &&
        !introNeedsRefresh
      ) {
        skippedFreshCount++;
        continue;
      }

      targets.push({
        ...target,
        commonNeedsRefresh,
        introNeedsRefresh,
      });
    }

    let apiCallCount =
      0;

    let processedPlaceCount =
      0;

    let commonInsertedCount =
      0;

    let introInsertedCount =
      0;

    let homepageUpdatedCount =
      0;

    let commonNoDataCount =
      0;

    let introNoDataCount =
      0;

    let completed =
      true;

    let retryable =
      false;

    let stopReason:
      string | null =
      null;

    /*
     * 외부 API 오류 분류.
     *
     * AUTH:
     *   자동으로 매일 반복하면 안 됨.
     *
     * RETRYABLE:
     *   quota / 서버 / 네트워크 문제.
     *   다음날 이어서 실행.
     *
     * FATAL:
     *   예상하지 못한 오류.
     *   상위 automation에서 FAILED 처리.
     */
    const classifyError = (
      error: unknown,
    ):
      | 'AUTH'
      | 'RETRYABLE'
      | 'FATAL' => {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const upper =
        message.toUpperCase();

      if (
        upper.includes('401') ||
        upper.includes('403') ||
        upper.includes('SERVICE KEY') ||
        upper.includes('SERVICE_KEY') ||
        upper.includes('UNREGISTERED') ||
        upper.includes('ACCESS DENIED') ||
        upper.includes('ACCESS_DENIED') ||
        upper.includes('AUTHENTICATION')
      ) {
        return 'AUTH';
      }

      if (
        upper.includes('429') ||
        upper.includes(
          'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
        ) ||
        upper.includes('RESULTCODE=22') ||
        upper.includes(': 22 ') ||
        /\b5\d\d\b/.test(upper) ||
        upper.includes('FETCH FAILED') ||
        upper.includes('ECONNRESET') ||
        upper.includes('ECONNREFUSED') ||
        upper.includes('ETIMEDOUT') ||
        upper.includes('ENOTFOUND') ||
        upper.includes('TIMEOUT') ||
        upper.includes('SOCKET') ||
        upper.includes('NETWORK')
      ) {
        return 'RETRYABLE';
      }

      return 'FATAL';
    };

    /*
     * 장소 단위 checkpoint.
     *
     * 해당 장소에 필요한 API를 모두 받은 뒤
     * 그 장소만 transaction commit한다.
     */
    for (
      const target
      of targets
    ) {
      const callsNeeded =
        Number(
          target.commonNeedsRefresh,
        ) +
        Number(
          target.introNeedsRefresh,
        );

      /*
       * 장소 절반만 처리하지 않도록
       * 해당 장소에 필요한 call 수가
       * 남은 budget보다 크면 시작하지 않는다.
       */
      if (
        apiCallCount +
          callsNeeded >
        maxApiCalls
      ) {
        completed =
          false;

        retryable =
          true;

        stopReason =
          'DAILY_BUDGET';

        break;
      }

      const commonPrepared:
        PreparedTourDetailRaw[] = [];

      const introPrepared:
        PreparedTourDetailRaw[] = [];

      /*
       * -------------------------
       * detailCommon2
       * -------------------------
       */
      if (
        target.commonNeedsRefresh
      ) {
        const params = {
          contentId:
            target.contentId,

          numOfRows:
            1,

          pageNo:
            1,
        };

        try {
          /*
           * 실패한 요청도 quota를 썼을 수 있으므로
           * request 전에 count한다.
           */
          apiCallCount++;

          const data =
            await this.request(
              'detailCommon2',
              params,
            );

          this.assertTourApiSuccess(
            data,
            'detailCommon2',
            target.contentId,
          );

          const items =
            this.extractDetailCommonItems(
              data,
            );

          if (
            items.length === 0
          ) {
            /*
             * 200 OK지만 해당 contentId에
             * detailCommon이 없는 경우.
             *
             * 이 sync version에서는
             * "확인했지만 데이터 없음"으로 저장한다.
             *
             * 그래야 매일 같은 contentId를
             * 무한 재시도하지 않는다.
             */
            commonNoDataCount++;

            commonPrepared.push({
              placeId:
                target.placeId,

              contentId:
                target.contentId,

              contentTypeId:
                target.contentTypeId,

              sourceModifiedAt:
                target.sourceModifiedAt,

              requestPayload:
                params,

              responsePayload: {
                __noData:
                  true,

                contentid:
                  target.contentId,

                contenttypeid:
                  target.contentTypeId,

                apiResponse:
                  data,
              },
            });
          } else {
            const item =
              items[0];

            const apiModifiedAt =
              this.parseTourDateTime(
                item?.modifiedtime
                  ? String(
                      item.modifiedtime,
                    )
                  : undefined,
              );

            commonPrepared.push({
              placeId:
                target.placeId,

              contentId:
                target.contentId,

              contentTypeId:
                item?.contenttypeid != null
                  ? String(
                      item.contenttypeid,
                    )
                  : target.contentTypeId,

              sourceModifiedAt:
                apiModifiedAt ??
                target.sourceModifiedAt,

              requestPayload:
                params,

              responsePayload:
                item,
            });
          }
        } catch (error) {
          const kind =
            classifyError(
              error,
            );

          if (
            kind ===
            'RETRYABLE'
          ) {
            completed =
              false;

            retryable =
              true;

            stopReason =
              `RETRYABLE_DETAIL_COMMON:` +
              target.contentId;

            break;
          }

          if (
            kind ===
            'AUTH'
          ) {
            completed =
              false;

            retryable =
              false;

            stopReason =
              `AUTH_FAILURE_DETAIL_COMMON:` +
              target.contentId;

            break;
          }

          throw error;
        }
      }

      /*
       * -------------------------
       * detailIntro2
       * -------------------------
       */
      if (
        target.introNeedsRefresh
      ) {
        if (
          !target.contentTypeId
        ) {
          /*
           * API request 자체가 불가능하다.
           * 매일 같은 row를 재시도하지 않도록
           * 예상하지 못한 데이터 오류로 처리.
           */
          throw new Error(
            `detailIntro2 requires contentTypeId: ` +
              `contentId=${target.contentId}`,
          );
        }

        const params = {
          contentId:
            target.contentId,

          contentTypeId:
            target.contentTypeId,

          numOfRows:
            10,

          pageNo:
            1,
        };

        try {
          apiCallCount++;

          const data =
            await this.request(
              'detailIntro2',
              params,
            );

          this.assertTourApiSuccess(
            data,
            'detailIntro2',
            target.contentId,
          );

          const rawIntroItem =
            data?.response
              ?.body
              ?.items
              ?.item;

          const introItems =
            !rawIntroItem
              ? []
              : Array.isArray(
                    rawIntroItem,
                  )
                ? rawIntroItem
                : [
                    rawIntroItem,
                  ];

          if (
            introItems.length ===
            0
          ) {
            /*
             * detailIntro2는 애초에
             * totalCount=0도 정상 결과다.
             */
            introNoDataCount++;
          }

          introPrepared.push({
            placeId:
              target.placeId,

            contentId:
              target.contentId,

            contentTypeId:
              target.contentTypeId,

            sourceModifiedAt:
              target.sourceModifiedAt,

            requestPayload:
              params,

            /*
             * operating-hours normalizer가
             * 전체 response 구조를 사용한다.
             */
            responsePayload:
              data,
          });
        } catch (error) {
          const kind =
            classifyError(
              error,
            );

          if (
            kind ===
            'RETRYABLE'
          ) {
            completed =
              false;

            retryable =
              true;

            stopReason =
              `RETRYABLE_DETAIL_INTRO:` +
              target.contentId;

            break;
          }

          if (
            kind ===
            'AUTH'
          ) {
            completed =
              false;

            retryable =
              false;

            stopReason =
              `AUTH_FAILURE_DETAIL_INTRO:` +
              target.contentId;

            break;
          }

          throw error;
        }
      }

      /*
       * common + intro가 모두 성공했을 때만
       * 이 장소를 commit한다.
       *
       * 여기서 기존 apply method의 transaction을
       * 그대로 재사용한다.
       */
      const applied =
        await this
          .applyPreparedSeoulDetailRefresh({
            common:
              commonPrepared,

            intro:
              introPrepared,

            mappedActiveCount:
              1,

            commonTargetCount:
              commonPrepared.length,

            introTargetCount:
              introPrepared.length,
          });

      commonInsertedCount +=
        applied.commonInsertedCount;

      introInsertedCount +=
        applied.introInsertedCount;

      homepageUpdatedCount +=
        applied.homepageUpdatedCount;

      processedPlaceCount++;
    }

    return {
      mappedActiveCount:
        latestSyncRows.length,

      stalePlaceCount:
        targets.length,

      skippedFreshCount,

      commonTargetCount,
      introTargetCount,

      processedPlaceCount,

      apiCallCount,
      maxApiCalls,

      commonInsertedCount,
      introInsertedCount,
      homepageUpdatedCount,

      commonNoDataCount,
      introNoDataCount,

      completed,
      retryable,
      stopReason,
    };
  }

  async normalizeSeoulOperatingHours() {
    const {
      stdout,
      stderr,
    } =
      await execFileAsync(
        'python3',
        [
          'scripts/tour_operating_hours_normalize.py',
          '--apply',
          '--replace-system-hours',
        ],
        {
          cwd:
            process.cwd(),

          env:
            process.env,

          maxBuffer:
            10 * 1024 * 1024,
        },
      );

    return {
      stdout:
        stdout.trim(),

      stderr:
        stderr.trim(),
    };
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
    const lclsMapping =
      await this.syncTourLclsMappingsFromRaw();
    return {
      areaCode: '1',
      totalCount,
      totalPages,
      fetchedCount,
      insertedCount,
      skippedCount,
      lclsMapping,
    };
  }

    /**
   * TourAPI detailCommon2 응답에서 item 배열 추출
   */
  private extractDetailCommonItems(data: any): any[] {
    const item = data?.response?.body?.items?.item;

    if (!item) {
      return [];
    }

    return Array.isArray(item) ? item : [item];
  }

  /**
   * TourAPI 장소 상세 공통정보 enrichment
   *
   * - place_external_ids의 TOUR_API / CONTENT_ID 대상
   * - 이미 detailCommon2 RAW가 존재하면 skip
   * - detailCommon2 응답을 raw_tour_api에 저장
   * - homepage가 있으면 places.homepage 업데이트
   */
  async syncSeoulPlaceDetails(limit?: number) {
    const source = await this.getTourApiSource();

    const tourPlaceExternalIds =
      await this.prisma.placeExternalId.findMany({
        where: {
          sourceId: source.id,
          idType: 'CONTENT_ID',
        },
        select: {
          placeId: true,
          externalId: true,
        },
        orderBy: {
          placeId: 'asc',
        },
      });

    let targets = tourPlaceExternalIds;

    if (limit && limit > 0) {
      targets = targets.slice(0, limit);
    }

    let processedCount = 0;
    let fetchedCount = 0;
    let skippedCount = 0;
    let rawInsertedCount = 0;
    let homepageUpdatedCount = 0;
    let noHomepageCount = 0;
    let failedCount = 0;
    let quotaExceeded = false;

    const failures: Array<{
      placeId: string;
      contentId: string;
      error: string;
    }> = [];

    for (const target of targets) {
      const placeId = target.placeId;
      const contentId = target.externalId;

      try {
        const existingRaw =
          await this.prisma.rawTourApi.findFirst({
            where: {
              sourceId: source.id,
              endpoint: 'detailCommon2',
              contentId,
            },
            orderBy: {
              fetchedAt: 'desc',
            },
          });

        if (existingRaw) {
          skippedCount++;
          processedCount++;

          const payload =
            existingRaw.responsePayload as Record<
              string,
              unknown
            >;

          const homepage =
            this.normalizeHomepage(
              typeof payload?.homepage === 'string'
                ? payload.homepage
                : null,
            );

          if (homepage) {
            const updated =
              await this.prisma.place.updateMany({
                where: {
                  id:
                    placeId,

                  NOT: {
                    ownerLockedFields: {
                      has:
                        'homepage',
                    },
                  },

                  OR: [
                    {
                      homepage: null,
                    },
                    {
                      homepage: {
                        not:
                          homepage,
                      },
                    },
                  ],
                },

                data: {
                  homepage,
                  updatedAt:
                    new Date(),
                },
              });

            homepageUpdatedCount +=
              updated.count;
          } else {
            noHomepageCount++;
          }

          continue;
        }

        const params = {
          contentId,
          numOfRows: 1,
          pageNo: 1,
        };

        const data = await this.request(
          'detailCommon2',
          params,
        );

        fetchedCount++;
        processedCount++;

        const items =
          this.extractDetailCommonItems(data);

        if (items.length === 0) {
          throw new Error(
            `detailCommon2 returned no items: ${JSON.stringify(data)}`,
          );
        }

        const item = items[0];

        await this.prisma.rawTourApi.create({
          data: {
            sourceId: source.id,
            endpoint: 'detailCommon2',

            contentId: item.contentid
              ? String(item.contentid)
              : contentId,

            contentTypeId: item.contenttypeid
              ? String(item.contenttypeid)
              : null,

            requestPayload: params,
            responsePayload: item,

            sourceModifiedAt:
              this.parseTourDateTime(
                item.modifiedtime
                  ? String(item.modifiedtime)
                  : undefined,
              ),
          },
        });

        rawInsertedCount++;

        const homepage =
          this.normalizeHomepage(
            item.homepage
              ? String(item.homepage)
              : null,
          );

        if (homepage) {
          const updated =
            await this.prisma.place.updateMany({
              where: {
                id:
                  placeId,

                NOT: {
                  ownerLockedFields: {
                    has:
                      'homepage',
                  },
                },

                OR: [
                  {
                    homepage: null,
                  },
                  {
                    homepage: {
                      not:
                        homepage,
                    },
                  },
                ],
              },

              data: {
                homepage,
                updatedAt:
                  new Date(),
              },
            });

          homepageUpdatedCount +=
            updated.count;
        } else {
          noHomepageCount++;
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        if (
          message.includes('429') ||
          message.includes(
            'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR',
          )
        ) {
          quotaExceeded = true;

          console.warn(
            `[TourAPI] Daily quota exceeded. Stopping detailCommon2 sync at placeId=${placeId.toString()}, contentId=${contentId}`,
          );

          break;
        }

        failedCount++;
        processedCount++;

        failures.push({
          placeId: placeId.toString(),
          contentId,
          error: message,
        });

        console.error(
          `[TourAPI] detailCommon2 failed - placeId=${placeId.toString()}, contentId=${contentId}`,
          error,
        );
      }

      if (processedCount % 50 === 0) {
        console.log(
          `[TourAPI] detailCommon2 progress ${processedCount}/${targets.length}`,
        );
      }
    }

    return {
      targetCount: targets.length,
      processedCount,
      fetchedCount,
      skippedCount,
      rawInsertedCount,
      homepageUpdatedCount,
      noHomepageCount,
      failedCount,
      quotaExceeded,
      failures,
    };
  }
}