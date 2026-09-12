import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

export class BusinessVisitVerificationQueryDto {
  @IsOptional()
  @IsIn([
    'ISSUED',
    'VERIFIED',
    'EXPIRED',
    'FAILED',
    'CANCELLED',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}