import { Module } from '@nestjs/common';

import { TourismDemandStrengthController } from './tourism-demand-strength.controller';
import { TourismDemandStrengthService } from './tourism-demand-strength.service';

@Module({
  controllers: [
    TourismDemandStrengthController,
  ],
  providers: [
    TourismDemandStrengthService,
  ],
  exports: [
    TourismDemandStrengthService,
  ],
})
export class TourismDemandStrengthModule {}