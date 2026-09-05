import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'password123!',
    description: '현재 비밀번호',
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    example: 'newPassword123!',
    description: '새 비밀번호',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;
}