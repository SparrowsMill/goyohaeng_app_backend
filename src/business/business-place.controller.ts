import {
  Body,
  Controller,
  Get,
  Patch,
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
  BusinessPlaceService,
} from './business-place.service';

import {
  UpdateBusinessPlaceDto,
} from './dto/update-business-place.dto';

interface BusinessRequest
  extends Request {
  business: BusinessContext;
}

@ApiTags('Business Place')
@ApiBearerAuth()
@Controller('business/place')
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessPlaceController {
  constructor(
    private readonly service:
      BusinessPlaceService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '내 관리 장소 조회',
  })
  getMyPlace(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service.getMyPlace(
      request.business.placeId,
    );
  }

  @Patch()
  @ApiOperation({
    summary:
      '내 관리 장소 기본정보 수정',
  })
  updateMyPlace(
    @Req()
    request: BusinessRequest,

    @Body()
    dto: UpdateBusinessPlaceDto,
  ) {
    return this.service.updateMyPlace(
      request.business.placeId,
      dto,
    );
  }
}