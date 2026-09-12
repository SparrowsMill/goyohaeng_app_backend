import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class BusinessLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}