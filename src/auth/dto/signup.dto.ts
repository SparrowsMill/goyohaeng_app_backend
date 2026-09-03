import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class SignupDto {
  @ApiProperty({
    example: 'yerin123',
    description: '로그인 아이디',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'password123!',
    description: '비밀번호',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: '조예린',
    description: '사용자 실명',
  })
  @IsString()
  @IsNotEmpty()
  realName: string;

  @ApiProperty({
    example: 'yerin@example.com',
    description: '이메일',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '010-1234-5678',
    description: '전화번호',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: '2002-05-20',
    description: '생년월일',
  })
  @IsDateString()
  birthDate: string;

  @ApiPropertyOptional({
    example: 'FEMALE',
    description: '성별',
    enum: ['MALE', 'FEMALE'],
  })
  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';
}