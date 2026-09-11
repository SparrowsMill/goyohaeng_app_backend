import { IsBoolean } from 'class-validator';

export class UpdateBusinessVerificationSettingDto {
  @IsBoolean()
  enabled: boolean;
}