import { Type } from 'class-transformer';

import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRecordDto {
  // YYYY-MM-DD
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  placeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userFoodId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitVerificationId?: number;

  @IsString()
  @MaxLength(50)
  title: string;

  @IsString()
  @MaxLength(200)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({
    each: true,
  })
  imageUrls?: string[];
}