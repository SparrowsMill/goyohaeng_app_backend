import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBusinessPlaceImageDto {
  @IsString()
  @IsNotEmpty()
  originalUrl: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string | null;

  @IsOptional()
  @IsString()
  imageName?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}