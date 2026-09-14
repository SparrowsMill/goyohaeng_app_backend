import { Module } from '@nestjs/common';

import { RegionVisitorModule } from '../region-visitor/region-visitor.module';
import { TourismResourceDemandModule } from '../tourism-resource-demand/tourism-resource-demand.module';
import { TourismDemandStrengthModule } from '../tourism-demand-strength/tourism-demand-strength.module';

import { GapDataPeriodService } from './gap-data-period.service';
import { ExternalApiAutomationService } from './external-api-automation.service';

@Module({
  imports: [
    RegionVisitorModule,
    TourismResourceDemandModule,
    TourismDemandStrengthModule,
  ],

  providers: [
    GapDataPeriodService,
    ExternalApiAutomationService,
  ],

  exports: [
    GapDataPeriodService,
    ExternalApiAutomationService,
  ],
})
export class ExternalApiAutomationModule {}