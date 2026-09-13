import {
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';

import {
  AnalyticsEventType,
} from '../analytics-event-type';

export class CreateAnalyticsEventDto {
  @IsInt()
  @Min(1)
  placeId: number;

  @IsEnum(
    AnalyticsEventType,
  )
  eventType:
    AnalyticsEventType;
}