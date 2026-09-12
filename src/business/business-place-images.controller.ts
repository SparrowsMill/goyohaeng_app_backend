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
  BusinessPlaceImagesService,
} from './business-place-images.service';

import {
  CreateBusinessPlaceImageDto,
} from './dto/create-business-place-image.dto';

import {
  UpdateBusinessPlaceImageDto,
} from './dto/update-business-place-image.dto';

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

@ApiTags('Business Place Images')
@ApiBearerAuth()
@Controller(
  'business/place/images',
)
@UseGuards(
  JwtAuthGuard,
  BusinessApprovedGuard,
)
export class BusinessPlaceImagesController {
  constructor(
    private readonly service:
      BusinessPlaceImagesService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      '관리 장소 이미지 목록 조회',
  })
  findAll(
    @Req()
    request: BusinessRequest,
  ) {
    return this.service.findAll(
      request.business.placeId,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      '관리 장소 이미지 등록',
  })
  create(
    @Req()
    request: BusinessRequest,

    @Body()
    dto:
      CreateBusinessPlaceImageDto,
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
      '관리 장소 이미지 수정 및 순서 변경',
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
      UpdateBusinessPlaceImageDto,
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
      '관리 장소 이미지 삭제',
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