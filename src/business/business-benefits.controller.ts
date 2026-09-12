import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
  BusinessBenefitsService,
} from './business-benefits.service';

import {
  CreateBusinessBenefitDto,
} from './dto/create-business-benefit.dto';

import {
  UpdateBusinessBenefitDto,
} from './dto/update-business-benefit.dto';

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

@ApiTags('Business Benefits')
@ApiBearerAuth()
@Controller(
  'business/place/benefits',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessBenefitsController {
  constructor(
    private readonly service:
      BusinessBenefitsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '관리 장소 혜택 목록 조회',
  })
  findAll(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service.findAll(
      request.business.placeId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary:
      '관리 장소 혜택 상세 조회',
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

  @Post()
  @ApiOperation({
    summary:
      '관리 장소 혜택 등록',
  })
  create(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      CreateBusinessBenefitDto,
  ) {
    return this.service.create(
      request.business.placeId,
      request.user.userId,
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      '관리 장소 혜택 수정',
  })
  update(
    @Req()
    request: BusinessRequest,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Body()
    dto:
      UpdateBusinessBenefitDto,
  ) {
    return this.service.update(
      request.business.placeId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      '관리 장소 혜택 삭제',
  })
  remove(
    @Req()
    request: BusinessRequest,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    return this.service.remove(
      request.business.placeId,
      id,
    );
  }
}