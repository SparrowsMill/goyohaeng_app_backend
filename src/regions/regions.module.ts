import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';

@Module({
  imports: [PrismaModule],
  controllers: [RegionsController],
  providers: [RegionsService],
})
export class RegionsModule {}