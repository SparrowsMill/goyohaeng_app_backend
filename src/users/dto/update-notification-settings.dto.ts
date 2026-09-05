import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiProperty({
    example: true,
    description: '프로모션 알림 활성화 여부',
  })
  @IsBoolean()
  promotionNotificationEnabled: boolean;

  @ApiProperty({
    example: true,
    description: '인근 관광 추천 알림 활성화 여부',
  })
  @IsBoolean()
  nearbyNotificationEnabled: boolean;

  @ApiProperty({
    example: true,
    description: '기록 글쓰기 알림 활성화 여부',
  })
  @IsBoolean()
  recordNotificationEnabled: boolean;
}