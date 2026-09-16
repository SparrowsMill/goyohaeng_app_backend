import {
  Module,
} from '@nestjs/common';

import {
  PassportModule,
} from '@nestjs/passport';

import {
  PrismaModule,
} from '../prisma/prisma.module';

import {
  AnalyticsController,
} from './analytics.controller';

import {
  AnalyticsService,
} from './analytics.service';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [
    AnalyticsController,
  ],

  providers: [
    AnalyticsService,
  ],
})
export class AnalyticsModule {}