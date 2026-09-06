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