import { Type } from 'class-transformer';

import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class GetRecordsQueryDto {
  @ApiPropertyOptional({
    type: Number,
    example: 1,
    default: 1,
    description: '페이지 번호',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 30,
    default: 20,
    description:
      '페이지당 조회 개수. 서버 최대 100개',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    example: '2026-08-20',
    description:
      '조회 시작일. YYYY-MM-DD 형식, KST 기준이며 해당 날짜를 포함합니다.',
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/,
    {
      message:
        'from은 YYYY-MM-DD 형식이어야 합니다.',
    },
  )
  from?: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-09-20',
    description:
      '조회 종료일. YYYY-MM-DD 형식, KST 기준이며 해당 날짜를 포함합니다.',
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/,
    {
      message:
        'to는 YYYY-MM-DD 형식이어야 합니다.',
    },
  )
  to?: string;
}