import {
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { TourismDemandStrengthService } from './tourism-demand-strength.service';

@Controller(
  'external-api/tourism-demand-strength',
)
export class TourismDemandStrengthController {
  constructor(
    private readonly service:
      TourismDemandStrengthService,
  ) {}

  @Get('latest-month')
  async latestMonth() {
    return {
      baseYm:
        await this.service.findLatestAvailableMonth(),
    };
  }

  @Post('sync-latest-seoul')
  async syncLatestSeoul() {
    return this.service.syncLatestSeoulStrength();
  }
}