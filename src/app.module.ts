import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RegionsModule } from './regions/regions.module';
import { PlacesModule } from './places/places.module';
import { CategoriesModule } from './categories/categories.module';
import { VisitVerificationsModule } from './visit-verifications/visit-verifications.module';

import { TourModule } from './external-api/tour/tour.module';
import { SmallBusinessModule } from './external-api/small-business/small-business.module';
import { RegionVisitorModule } from './external-api/region-visitor/region-visitor.module';
import { TourismResourceDemandModule } from './external-api/tourism-resource-demand/tourism-resource-demand.module';
import { TourismDemandStrengthModule } from './external-api/tourism-demand-strength/tourism-demand-strength.module';
import { ConcentrationForecastModule } from './external-api/concentration-forecast/concentration-forecast.module';
import { NaverModule } from './external-api/naver/naver.module';

import { FoodsModule } from './foods/foods.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { RecordsModule } from './records/records.module';

import { BusinessModule } from './business/business.module';
import { ExternalApiAutomationModule } from './external-api/automation/external-api-automation.module';
import { ScheduleModule } from '@nestjs/schedule';

import {
  AnalyticsModule,
} from './analytics/analytics.module';

import {
  UploadsModule,
} from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),

    PrismaModule,

    AuthModule,
    UsersModule,
    RegionsModule,
    PlacesModule,
    CategoriesModule,
    VisitVerificationsModule,

    TourModule,
    SmallBusinessModule,
    RegionVisitorModule,
    TourismResourceDemandModule,
    TourismDemandStrengthModule,
    ConcentrationForecastModule,
    NaverModule,

    FoodsModule,
    IngredientsModule,
    RecordsModule,

    BusinessModule,
    ExternalApiAutomationModule,

    AnalyticsModule,

    UploadsModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,
  ],
})
export class AppModule {}