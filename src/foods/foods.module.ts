import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PrismaModule } from '../prisma/prisma.module';

import { FoodsController } from './foods.controller';
import { FoodsService } from './foods.service';

import { FoodHistoriesController } from './food-histories.controller';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],
  controllers: [
  FoodsController,
  FoodHistoriesController,
],
  providers: [FoodsService],
  exports: [FoodsService],
})
export class FoodsModule {}