import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateBusinessTemporaryClosureDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}