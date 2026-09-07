import { Module } from '@nestjs/common';

import { ConcentrationForecastController } from './concentration-forecast.controller';
import { ConcentrationForecastService } from './concentration-forecast.service';

@Module({
  controllers: [
    ConcentrationForecastController,
  ],
  providers: [
    ConcentrationForecastService,
  ],
  exports: [
    ConcentrationForecastService,
  ],
})
export class ConcentrationForecastModule {}