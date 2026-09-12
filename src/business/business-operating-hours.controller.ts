import {
  Body,
  Controller,
  Get,
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
  BusinessOperatingHoursService,
} from './business-operating-hours.service';

import {
  UpdateBusinessOperatingHoursDto,
} from './dto/update-business-operating-hours.dto';

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
  'Business Operating Hours',
)
@ApiBearerAuth()
@Controller(
  'business/place/operating-hours',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessOperatingHoursController {
  constructor(
    private readonly service:
      BusinessOperatingHoursService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '관리 장소 운영시간 조회',
  })
  getOperatingHours(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service
      .getOperatingHours(
        request.business.placeId,
      );
  }

  @Put()
  @ApiOperation({
    summary:
      '관리 장소 운영시간 및 휴게시간 저장',
  })
  updateOperatingHours(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      UpdateBusinessOperatingHoursDto,
  ) {
    return this.service
      .updateOperatingHours(
        request.business.placeId,
        request.user.userId,
        dto,
      );
  }
}