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
  BusinessNaverAnalyticsService,
} from './business-naver-analytics.service';

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
export class BusinessNaverAnalyticsController {
  constructor(
    private readonly service:
      BusinessNaverAnalyticsService,
  ) {}

  @Get('naver')
  @ApiOperation({
    summary:
      '가맹점 네이버 검색 관심도 분석 조회',
  })
  getNaverAnalytics(
    @Req()
    request:
      BusinessRequest,
  ) {
    return this.service
      .getNaverAnalytics(
        request.business
          .placeId,
      );
  }
}