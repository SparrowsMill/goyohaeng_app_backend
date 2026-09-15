import { Module } from '@nestjs/common';

import { RegionVisitorModule } from '../region-visitor/region-visitor.module';
import { TourismResourceDemandModule } from '../tourism-resource-demand/tourism-resource-demand.module';
import { TourismDemandStrengthModule } from '../tourism-demand-strength/tourism-demand-strength.module';
import { NaverModule } from '../naver/naver.module';

import { GapDataPeriodService } from './gap-data-period.service';
import { GapScoreCalculationService } from './gap-score-calculation.service';
import { ExternalApiAutomationService } from './external-api-automation.service';
import { TourModule } from '../tour/tour.module';

@Module({
  imports: [
    RegionVisitorModule,
    TourismResourceDemandModule,
    TourismDemandStrengthModule,
    NaverModule,
    TourModule,
  ],

  providers: [
    GapDataPeriodService,
    GapScoreCalculationService,
    ExternalApiAutomationService,
  ],

  exports: [
    GapDataPeriodService,
    GapScoreCalculationService,
    ExternalApiAutomationService,
  ],
})
export class ExternalApiAutomationModule {}