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
  BusinessRevisitAnalyticsService,
} from './business-revisit-analytics.service';

interface BusinessRequest
  extends Request {
  business:
    BusinessContext;
}

@ApiTags(
  'Business Analytics',
)
@ApiBearerAuth()
@Controller(
  'business/analytics',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessRevisitAnalyticsController {
  constructor(
    private readonly service:
      BusinessRevisitAnalyticsService,
  ) {}

  @Get('revisit')
  @ApiOperation({
    summary:
      '가맹점 재방문 분석 조회',
  })
  getRevisitAnalytics(
    @Req()
    request:
      BusinessRequest,
  ) {
    return this.service
      .getRevisitAnalytics(
        request.business
          .placeId,
      );
  }

  @Get('verification-funnel')
@ApiOperation({
  summary:
    '가맹점 방문인증 퍼널 분석 조회',
})
getVerificationFunnel(
  @Req()
  request:
    BusinessRequest,
) {
  return this.service
    .getVerificationFunnel(
      request.business
        .placeId,
    );
}
}