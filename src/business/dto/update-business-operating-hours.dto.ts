import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class BusinessOperatingHourItemDto {
  /*
   * 1 = 월요일
   * 2 = 화요일
   * ...
   * 7 = 일요일
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @IsBoolean()
  isClosed: boolean;

  @IsOptional()
  @Matches(
    /^([01]\d|2[0-3]):[0-5]\d$/,
  )
  openTime?: string | null;

  @IsOptional()
  @Matches(
    /^([01]\d|2[0-3]):[0-5]\d$/,
  )
  closeTime?: string | null;

  @IsOptional()
  @Matches(
    /^([01]\d|2[0-3]):[0-5]\d$/,
  )
  breakStartTime?: string | null;

  @IsOptional()
  @Matches(
    /^([01]\d|2[0-3]):[0-5]\d$/,
  )
  breakEndTime?: string | null;
}

export class UpdateBusinessOperatingHoursDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({
    each: true,
  })
  @Type(
    () =>
      BusinessOperatingHourItemDto,
  )
  hours: BusinessOperatingHourItemDto[];
}