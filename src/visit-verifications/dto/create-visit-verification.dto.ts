import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

export class CreateVisitVerificationDto {
  @ApiProperty({
    example: 1,
    description: '방문 인증을 진행할 장소 ID',
  })
  @IsInt()
  placeId: number;

  @ApiProperty({
    example: 30,
    enum: [10, 30, 60],
    description: '예상 도착 시간(분)',
  })
  @IsInt()
  @IsIn([10, 30, 60])
  arrivalOptionMinutes: number;
}