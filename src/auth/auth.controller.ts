import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: '아이디 중복 확인',
  })
  @ApiOkResponse({
    description: '아이디 사용 가능 여부 조회 성공',
  })
  @ApiBadRequestResponse({
    description: '아이디가 입력되지 않음',
  })
  @Get('check-username')
  checkUsername(@Query('username') username: string) {
    return this.authService.checkUsername(username);
  }

  @ApiOperation({
    summary: '회원가입',
  })
  @ApiBadRequestResponse({
    description: '회원가입 입력값이 올바르지 않음',
  })
  @ApiConflictResponse({
    description: '이미 사용 중인 아이디 또는 이메일',
  })
  @Post('signup')
  signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @ApiOperation({
    summary: '로그인',
  })
  @ApiOkResponse({
    description: '로그인 성공 및 JWT 발급',
  })
  @ApiBadRequestResponse({
    description: '로그인 입력값이 올바르지 않음',
  })
  @ApiUnauthorizedResponse({
    description: '아이디 또는 비밀번호 불일치',
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}