import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBusinessPlaceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string | null;

  @IsOptional()
  @IsString()
  homepage?: string | null;

  @IsOptional()
  @IsString()
  overview?: string | null;
}