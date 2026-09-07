import { Module } from '@nestjs/common';

import { RegionVisitorController } from './region-visitor.controller';
import { RegionVisitorService } from './region-visitor.service';

@Module({
  controllers: [
    RegionVisitorController,
  ],
  providers: [
    RegionVisitorService,
  ],
  exports: [
    RegionVisitorService,
  ],
})
export class RegionVisitorModule {}