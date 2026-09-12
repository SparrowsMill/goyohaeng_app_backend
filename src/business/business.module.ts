import { Module } from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { BusinessAuthController } from './business-auth.controller';
import { BusinessAuthService } from './business-auth.service';

import { BusinessMeController } from './business-me.controller';
import { BusinessAccountService } from './business-account.service';

import { BusinessAccountGuard } from './business-account.guard';
import { BusinessApprovedGuard } from './business-approved.guard';


import { VisitVerificationsModule } from '../visit-verifications/visit-verifications.module';

import { BusinessVisitVerificationsController } from './business-visit-verifications.controller';

import { BusinessVisitVerificationsService } from './business-visit-verifications.service';

import {
  BusinessPlaceController,
} from './business-place.controller';

import {
  BusinessPlaceService,
} from './business-place.service';

import {
  BusinessOperatingHoursController,
} from './business-operating-hours.controller';

import {
  BusinessOperatingHoursService,
} from './business-operating-hours.service';

import {
  BusinessSpecialHoursController,
} from './business-special-hours.controller';

import {
  BusinessSpecialHoursService,
} from './business-special-hours.service';

import {
  BusinessBenefitsController,
} from './business-benefits.controller';

import {
  BusinessBenefitsService,
} from './business-benefits.service';

import {
  BusinessPlaceImagesController,
} from './business-place-images.controller';

import {
  BusinessPlaceImagesService,
} from './business-place-images.service';

import {
  UsersModule,
} from '../users/users.module';

import {
  BusinessAccountSettingsController,
} from './business-account-settings.controller';

import {
  BusinessDashboardController,
} from './business-dashboard.controller';

import {
  BusinessDashboardService,
} from './business-dashboard.service';

import {
  BusinessRevisitAnalyticsController,
} from './business-revisit-analytics.controller';

import {
  BusinessRevisitAnalyticsService,
} from './business-revisit-analytics.service';

import {
  BusinessNaverAnalyticsController,
} from './business-naver-analytics.controller';

import {
  BusinessNaverAnalyticsService,
} from './business-naver-analytics.service';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],

      inject: [ConfigService],

      useFactory:
        (
          configService:
            ConfigService,
        ) => ({
          secret:
            configService
              .getOrThrow<string>(
                'JWT_ACCESS_SECRET',
              ),

          signOptions: {
            expiresIn: '1h',
          },
        }),
    }),
    VisitVerificationsModule,
    UsersModule,
  ],

  controllers: [
    BusinessAuthController,
    BusinessMeController,
    BusinessVisitVerificationsController,
    BusinessPlaceController,
    BusinessOperatingHoursController,
    BusinessSpecialHoursController,
    BusinessBenefitsController,
    BusinessPlaceImagesController,
    BusinessAccountSettingsController,
    BusinessDashboardController,
    BusinessRevisitAnalyticsController,
    BusinessNaverAnalyticsController,
  ],

  providers: [
    BusinessAuthService,
    BusinessAccountService,

    BusinessAccountGuard,
    BusinessApprovedGuard,

    BusinessVisitVerificationsService,

    BusinessPlaceService,

    BusinessOperatingHoursService,
    BusinessSpecialHoursService,

    BusinessBenefitsService,

    BusinessPlaceImagesService,

    BusinessDashboardService,

    BusinessRevisitAnalyticsService,

    BusinessNaverAnalyticsService,
  ],

  exports: [
    BusinessAccountService,
    BusinessApprovedGuard,
  ],
})
export class BusinessModule {}