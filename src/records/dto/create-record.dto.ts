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
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateRecordDto {
  @ApiPropertyOptional({
    example: '2026-09-14',
    description:
      '방문 날짜. YYYY-MM-DD 형식',
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
      '등록된 장소 ID. manualPlaceName과 동시에 값을 가질 수 없습니다.',
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
      '직접 입력한 장소명. 앞뒤 공백 제거 후 최대 100자이며 placeId와 동시에 값을 가질 수 없습니다.',
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
    type: Number,
    example: 9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userFoodId?: number;

  @ApiPropertyOptional({
    type: Number,
    example: 12,
    description:
      '본인의 VERIFIED 방문 인증 ID',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitVerificationId?: number;

  @ApiProperty({
    example: '저녁 산책',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  title: string;

  @ApiProperty({
    example:
      '조용히 산책하며 하루를 마무리했어요.',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  body: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 5,
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