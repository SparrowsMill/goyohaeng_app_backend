import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type {
  Request,
} from 'express';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  AnalyticsService,
} from './analytics.service';

import {
  CreateAnalyticsEventDto,
} from './dto/create-analytics-event.dto';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@UseGuards(
  JwtAuthGuard,
)
export class AnalyticsController {
  constructor(
    private readonly service:
      AnalyticsService,
  ) {}

  @Post('events')
  @ApiOperation({
    summary:
      '사용자 행동 이벤트 기록',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  createEvent(
    @Req()
    request:
      Request & {
        user:
          AuthenticatedUser;
      },

    @Body()
    dto:
      CreateAnalyticsEventDto,
  ) {
    return this.service
      .createEvent(
        request.user.userId,
        dto,
      );
  }
}