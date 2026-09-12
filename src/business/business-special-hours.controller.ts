import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  BusinessApprovedGuard,
  BusinessContext,
} from './business-approved.guard';

import {
  BusinessSpecialHoursService,
} from './business-special-hours.service';

import {
  UpdateBusinessSpecialHourDto,
} from './dto/update-business-special-hour.dto';

import {
  CreateBusinessTemporaryClosureDto,
} from './dto/create-business-temporary-closure.dto';

interface AuthenticatedBusinessUser {
  userId: number;
  username: string;
  accountType: string;
}

interface BusinessRequest
  extends Request {
  user:
    AuthenticatedBusinessUser;

  business:
    BusinessContext;
}

@ApiTags(
  'Business Special Hours',
)
@ApiBearerAuth()
@Controller(
  'business/place',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessSpecialHoursController {
  constructor(
    private readonly service:
      BusinessSpecialHoursService,
  ) {}

  @Get('special-hours')
  @ApiOperation({
    summary:
      '특별 운영일 및 임시휴무 조회',
  })
  getSpecialHours(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service
      .getSpecialHours(
        request.business.placeId,
      );
  }

  @Put('special-hours')
  @ApiOperation({
    summary:
      '특별 운영일 저장 또는 수정',
  })
  updateSpecialHour(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      UpdateBusinessSpecialHourDto,
  ) {
    return this.service
      .updateSpecialHour(
        request.business.placeId,
        request.user.userId,
        dto,
      );
  }

  @Delete(
    'special-hours/:date',
  )
  @ApiOperation({
    summary:
      '특별 운영일 삭제',
  })
  deleteSpecialHour(
    @Req()
    request: BusinessRequest,

    @Param('date')
    date: string,
  ) {
    return this.service
      .deleteSpecialHour(
        request.business.placeId,
        date,
      );
  }

  @Post(
    'temporary-closures',
  )
  @ApiOperation({
    summary:
      '임시휴무 기간 등록',
  })
  createTemporaryClosure(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      CreateBusinessTemporaryClosureDto,
  ) {
    return this.service
      .createTemporaryClosure(
        request.business.placeId,
        request.user.userId,
        dto,
      );
  }
}