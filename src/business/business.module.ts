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
  ],

  controllers: [
    BusinessAuthController,
    BusinessMeController,
    BusinessVisitVerificationsController,
  ],

  providers: [
    BusinessAuthService,
    BusinessAccountService,

    BusinessAccountGuard,
    BusinessApprovedGuard,

    BusinessVisitVerificationsService,
  ],

  exports: [
    BusinessAccountService,
    BusinessApprovedGuard,
  ],
})
export class BusinessModule {}