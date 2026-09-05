import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: '예린',
    description: '사용자 이름',
  })
  @IsOptional()
  @IsString()
  realName?: string;

  @ApiPropertyOptional({
    example: '1995-05-20',
    description: '생년월일',
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'FEMALE',
    enum: ['MALE', 'FEMALE'],
    description: '성별',
  })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';
}