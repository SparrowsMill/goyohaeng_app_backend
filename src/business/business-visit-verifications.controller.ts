import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
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
  BusinessVisitVerificationsService,
} from './business-visit-verifications.service';

import {
  BusinessVisitVerificationQueryDto,
} from './dto/business-visit-verification-query.dto';

import {
  RejectBusinessVisitVerificationDto,
} from './dto/reject-business-visit-verification.dto';

import {
  UpdateBusinessVerificationSettingDto,
} from './dto/update-business-verification-setting.dto';

import {
  UpdateBusinessVerificationHoursDto,
} from './dto/update-business-verification-hours.dto';

interface AuthenticatedBusinessUser {
  userId: number;
  username: string;
  accountType: string;
}

interface BusinessRequest
  extends Request {
  user: AuthenticatedBusinessUser;
  business: BusinessContext;
}

@ApiTags(
  'Business Visit Verifications',
)
@ApiBearerAuth()
@Controller(
  'business/visit-verifications',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessVisitVerificationsController {
  constructor(
    private readonly service:
      BusinessVisitVerificationsService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary:
      '관리 장소 방문 인증 요약 조회',
  })
  getSummary(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service.getSummary(
      request.business.placeId,
    );
  }

  @Get('intake-setting')
  @ApiOperation({
    summary:
      '방문 인증 접수 설정 조회',
  })
  getIntakeSetting(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service
      .getIntakeSetting(
        request.business.placeId,
      );
  }

  @Patch('intake-setting')
  @ApiOperation({
    summary:
      '방문 인증 접수 ON/OFF 변경',
  })
  updateIntakeSetting(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      UpdateBusinessVerificationSettingDto,
  ) {
    return this.service
      .updateIntakeSetting(
        request.business.placeId,
        dto.enabled,
        request.user.userId,
      );
  }

  /*
   * 방문 인증 가능시간
   */
  @Get('verification-hours')
  @ApiOperation({
    summary:
      '방문 인증 가능시간 조회',
  })
  getVerificationHours(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service
      .getVerificationHours(
        request.business.placeId,
      );
  }

  @Put('verification-hours')
  @ApiOperation({
    summary:
      '방문 인증 가능시간 저장',
  })
  updateVerificationHours(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      UpdateBusinessVerificationHoursDto,
  ) {
    return this.service
      .updateVerificationHours(
        request.business.placeId,
        request.user.userId,
        dto,
      );
  }

  @Get()
  @ApiOperation({
    summary:
      '관리 장소 방문 인증 목록 조회',
  })
  findAll(
    @Req()
    request: BusinessRequest,

    @Query()
    query:
      BusinessVisitVerificationQueryDto,
  ) {
    return this.service.findAll(
      request.business.placeId,
      query,
    );
  }

  /*
   * :id는 고정 경로보다 아래에 둔다.
   */
  @Get(':id')
  @ApiOperation({
    summary:
      '방문 인증 세션 상세 조회',
  })
  findById(
    @Req()
    request: BusinessRequest,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    return this.service.findById(
      request.business.placeId,
      id,
    );
  }

  @Post(':id/approve')
  @ApiOperation({
    summary:
      '방문 인증 승인',
  })
  approve(
    @Req()
    request: BusinessRequest,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    return this.service.approve(
      request.business.placeId,
      id,
    );
  }

  @Post(':id/reject')
  @ApiOperation({
    summary:
      '방문 인증 반려',
  })
  reject(
    @Req()
    request: BusinessRequest,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Body()
    dto:
      RejectBusinessVisitVerificationDto,
  ) {
    return this.service.reject(
      request.business.placeId,
      id,
      dto.reason,
    );
  }
}