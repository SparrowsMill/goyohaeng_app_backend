import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
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
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}