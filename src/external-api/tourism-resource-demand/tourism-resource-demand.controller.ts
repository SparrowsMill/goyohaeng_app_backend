import {
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { TourismResourceDemandService } from './tourism-resource-demand.service';

@Controller(
  'external-api/tourism-resource-demand',
)
export class TourismResourceDemandController {
  constructor(
    private readonly tourismResourceDemandService:
      TourismResourceDemandService,
  ) {}

  /**
   * 실제 API에서 가장 최신 제공월만 탐색.
   * DB 저장 X
   */
  @Get('latest-month')
  async getLatestMonth() {
    const baseYm =
      await this.tourismResourceDemandService
        .findLatestAvailableMonth();

    return {
      baseYm,
    };
  }

  /**
   * 최신 제공월 서울 전체 수집
   */
  @Post('sync-latest-seoul')
  async syncLatestSeoul() {
    return this.tourismResourceDemandService
      .syncLatestSeoulDemand();
  }
}