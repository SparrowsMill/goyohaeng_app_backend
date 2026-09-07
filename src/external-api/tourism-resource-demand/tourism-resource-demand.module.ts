import { Module } from '@nestjs/common';

import { TourismResourceDemandController } from './tourism-resource-demand.controller';
import { TourismResourceDemandService } from './tourism-resource-demand.service';

@Module({
  controllers: [
    TourismResourceDemandController,
  ],
  providers: [
    TourismResourceDemandService,
  ],
  exports: [
    TourismResourceDemandService,
  ],
})
export class TourismResourceDemandModule {}