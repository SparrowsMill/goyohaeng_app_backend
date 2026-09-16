import {
  Transform,
  Type,
} from 'class-transformer';

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

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateRecordDto {
  @ApiPropertyOptional({
    example: '2026-09-14',
    description:
      '생략하면 기존 날짜를 유지합니다.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 4155,
    description:
      '등록 장소 ID. 생략하면 유지, null이면 해제합니다. manualPlaceName과 동시에 값을 가질 수 없습니다.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  placeId?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    example:
      '집 근처 작은 공원',
    description:
      '수동 장소명. 생략하면 유지, null이면 해제합니다. 앞뒤 공백 제거 후 최대 100자입니다.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim()
      : value,
  )
  @IsString()
  @MaxLength(100)
  manualPlaceName?:
    | string
    | null;

  @ApiPropertyOptional({
    example: '저녁 산책',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiPropertyOptional({
    example:
      '조용히 산책하며 하루를 마무리했어요.',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  body?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
    description:
      '생략하면 기존 이미지를 유지하고, 빈 배열이면 모두 삭제합니다.',
    example: [
      'https://example.com/photo.jpg',
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({
    each: true,
  })
  imageUrls?: string[];
}