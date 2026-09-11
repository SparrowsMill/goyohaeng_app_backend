import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class BusinessVerificationHourItemDto {
  /*
   * 1 = 월요일
   * 2 = 화요일
   * ...
   * 7 = 일요일
   * 8 = 공휴일
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;
}

export class UpdateBusinessVerificationHoursDto {
  @IsIn([
    'SAME_AS_OPERATING',
    'CUSTOM',
  ])
  hoursMode:
    | 'SAME_AS_OPERATING'
    | 'CUSTOM';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      BusinessVerificationHourItemDto,
  )
  hours?: BusinessVerificationHourItemDto[];
}