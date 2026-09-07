// prisma/seed.ts

import 'dotenv/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../src/generated/prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined');
}

const adapter = new PrismaNeon({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const seoulDistricts = [
  '종로구',
  '중구',
  '용산구',
  '성동구',
  '광진구',
  '동대문구',
  '중랑구',
  '성북구',
  '강북구',
  '도봉구',
  '노원구',
  '은평구',
  '서대문구',
  '마포구',
  '양천구',
  '강서구',
  '구로구',
  '금천구',
  '영등포구',
  '동작구',
  '관악구',
  '서초구',
  '강남구',
  '송파구',
  '강동구',
];

async function main() {
  const externalSources = [
    {
      code: 'TOUR_API',
      name: '한국관광공사 TourAPI 국문 관광정보',
      baseUrl: 'https://apis.data.go.kr/B551011/KorService2',
      refreshCycle: null,
    },
    {
      code: 'SMALL_BUSINESS_API',
      name: '소상공인시장진흥공단 상가(상권)정보',
      baseUrl: null,
      refreshCycle: 'QUARTERLY',
    },
    {
      code: 'REGION_VISITOR_API',
      name: '한국관광공사 지역별 방문자수',
      baseUrl: null,
      refreshCycle: 'DAILY',
    },
    {
      code: 'TOURISM_RESOURCE_DEMAND_API',
      name: '한국관광공사 지역별 관광 자원 수요',
      baseUrl: null,
      refreshCycle: 'MONTHLY',
    },
    {
      code: 'TOURISM_DEMAND_STRENGTH_API',
      name: '한국관광공사 지역별 관광 수요 강도',
      baseUrl: null,
      refreshCycle: 'MONTHLY',
    },
    {
      code: 'CONCENTRATION_FORECAST_API',
      name: '한국관광공사 관광지 집중률 예측',
      baseUrl: null,
      refreshCycle: 'DAILY',
    },
    {
      code: 'NAVER_DATALAB',
      name: 'Naver DataLab Search Trend',
      baseUrl: 'https://openapi.naver.com/v1/datalab/search',
      refreshCycle: 'ON_DEMAND',
    },
  ];

  for (const source of externalSources) {
    await prisma.externalSource.upsert({
      where: {
        code: source.code,
      },
      update: {
        name: source.name,
        baseUrl: source.baseUrl,
        refreshCycle: source.refreshCycle,
      },
      create: source,
    });
  }
    // 서울특별시가 이미 있으면 사용하고,
  // 없으면 새로 생성
  let seoul = await prisma.region.findFirst({
    where: {
      parentId: null,
      regionType: 'PROVINCE',
      name: '서울특별시',
    },
  });

  if (!seoul) {
    seoul = await prisma.region.create({
      data: {
        parentId: null,
        regionType: 'PROVINCE',
        name: '서울특별시',
      },
    });
  }

  // 서울 25개 자치구
  for (const districtName of seoulDistricts) {
    const existingDistrict = await prisma.region.findFirst({
      where: {
        parentId: seoul.id,
        regionType: 'DISTRICT',
        name: districtName,
      },
    });

    if (!existingDistrict) {
      await prisma.region.create({
        data: {
          parentId: seoul.id,
          regionType: 'DISTRICT',
          name: districtName,
        },
      });
    }
  }


  console.log('external_sources seed completed');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });