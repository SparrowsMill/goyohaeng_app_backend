import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import {
  BusinessAccountGuard,
} from './business-account.guard';

import {
  BusinessAccountService,
} from './business-account.service';

interface AuthenticatedBusinessUser {
  userId: number;
  username: string;
  accountType: string;
}

@ApiTags('Business Account')
@ApiBearerAuth()
@Controller('business/me')
export class BusinessMeController {
  constructor(
    private readonly businessAccountService:
      BusinessAccountService,
  ) {}

  @Get('approval-status')
  @ApiOperation({
    summary:
      '가맹점 관리자 승인 상태 조회',
  })
  @UseGuards(
    JwtAuthGuard,
    BusinessAccountGuard,
  )
  getApprovalStatus(
    @Req()
    req: Request & {
      user: AuthenticatedBusinessUser;
    },
  ) {
    return this.businessAccountService
      .getApprovalStatus(
        req.user.userId,
      );
  }

  @Get()
  @ApiOperation({
    summary:
      '내 가맹점 관리자 계정 정보 조회',
  })
  @UseGuards(
    JwtAuthGuard,
    BusinessAccountGuard,
  )
  getMyAccount(
    @Req()
    req: Request & {
      user: AuthenticatedBusinessUser;
    },
  ) {
    return this.businessAccountService
      .getMyAccount(
        req.user.userId,
      );
  }
}