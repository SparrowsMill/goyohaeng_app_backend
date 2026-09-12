import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateBusinessSpecialHourDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate: string;

  @IsIn([
    'CLOSED',
    'SPECIAL_OPEN',
  ])
  scheduleType:
    | 'CLOSED'
    | 'SPECIAL_OPEN';

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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}