import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BusinessSignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  realName: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsInt()
  placeId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  businessName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessRegistrationNo: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  submittedStoreAddress: string;
}