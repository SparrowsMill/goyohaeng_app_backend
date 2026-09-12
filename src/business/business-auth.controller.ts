import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { BusinessAuthService } from './business-auth.service';
import { BusinessSignupDto } from './dto/business-signup.dto';
import { BusinessLoginDto } from './dto/business-login.dto';

@ApiTags('Business Auth')
@Controller('business/auth')
export class BusinessAuthController {
  constructor(
    private readonly businessAuthService:
      BusinessAuthService,
  ) {}

  @Get('check-username')
  @ApiOperation({
    summary:
      '가맹점 관리자 아이디 중복 확인',
  })
  checkUsername(
    @Query('username') username: string,
  ) {
    return this.businessAuthService
      .checkUsername(username);
  }

  @Post('signup')
  @ApiOperation({
    summary: '가맹점 가입 신청',
  })
  signup(
    @Body() dto: BusinessSignupDto,
  ) {
    return this.businessAuthService
      .signup(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: '가맹점 관리자 로그인',
  })
  login(
    @Body() dto: BusinessLoginDto,
  ) {
    return this.businessAuthService
      .login(dto);
  }
}