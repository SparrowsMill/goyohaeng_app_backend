import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { VisitVerificationsController } from './visit-verifications.controller';
import { VisitVerificationsService } from './visit-verifications.service';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [
    VisitVerificationsController,
  ],

  providers: [
    VisitVerificationsService,
  ],

  exports: [
    VisitVerificationsService,
  ],
})
export class VisitVerificationsModule {}