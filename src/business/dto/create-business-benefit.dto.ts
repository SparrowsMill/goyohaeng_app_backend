import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBusinessBenefitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}