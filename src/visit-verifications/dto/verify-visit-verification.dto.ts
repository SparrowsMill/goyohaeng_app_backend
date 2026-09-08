import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class VerifyVisitVerificationDto {
  @ApiProperty({
    example: '583214',
    description: '방문 인증 6자리 코드',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  verificationCode: string;
}