import {
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class RejectBusinessVisitVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}