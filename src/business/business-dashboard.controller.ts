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

import type {
  Request,
} from 'express';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  BusinessApprovedGuard,
  BusinessContext,
} from './business-approved.guard';

import {
  BusinessDashboardService,
} from './business-dashboard.service';

interface BusinessRequest
  extends Request {
  business:
    BusinessContext;
}

@ApiTags(
  'Business Dashboard',
)
@ApiBearerAuth()
@Controller(
  'business/dashboard',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessDashboardController {
  constructor(
    private readonly service:
      BusinessDashboardService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '가맹점 관리자 메인 대시보드 조회',
  })
  getDashboard(
    @Req()
    request:
      BusinessRequest,
  ) {
    return this.service
      .getDashboard(
        request.business
          .placeId,
      );
  }
}