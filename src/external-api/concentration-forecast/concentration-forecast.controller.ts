import {
  Controller,
  Post,
} from '@nestjs/common';

import { ConcentrationForecastService } from './concentration-forecast.service';

@Controller(
  'external-api/concentration-forecast',
)
export class ConcentrationForecastController {
  constructor(
    private readonly service:
      ConcentrationForecastService,
  ) {}

  @Post('sync-current-seoul')
  async syncCurrentSeoul() {
    return this.service.syncCurrentSeoulForecast();
  }
}