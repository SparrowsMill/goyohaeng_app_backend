import { Module } from '@nestjs/common';

import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { RecordsController } from './records.controller';

import { RecordsService } from './records.service';

@Module({
  imports: [
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  controllers: [
    RecordsController,
  ],

  providers: [
    RecordsService,
  ],
})
export class RecordsModule {}