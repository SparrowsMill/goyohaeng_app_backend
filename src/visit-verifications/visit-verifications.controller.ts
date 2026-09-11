import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import {
  CreateVisitVerificationDto,
} from './dto/create-visit-verification.dto';

import {
  VisitVerificationsService,
} from './visit-verifications.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Visit Verifications')
@ApiBearerAuth()
@Controller('visit-verifications')
export class VisitVerificationsController {
  constructor(
    private readonly visitVerificationsService:
      VisitVerificationsService,
  ) {}

  @ApiOperation({
    summary: '방문 인증 세션 생성',
  })
  @ApiCreatedResponse({
    description:
      '방문 인증 세션 생성 성공',
  })
  @ApiBadRequestResponse({
    description:
      '방문 인증 불가 / 운영시간 외 / 이미 진행 중인 인증',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Req()
    request: Request,

    @Body()
    dto: CreateVisitVerificationDto,
  ) {
    const user =
      request.user as AuthenticatedUser;

    return this.visitVerificationsService.create(
      user.userId,
      dto,
    );
  }

  @ApiOperation({
    summary: '방문 인증 세션 조회',
  })
  @ApiOkResponse({
    description:
      '방문 인증 세션 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description:
      '방문 인증 세션을 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(
    @Req()
    request: Request,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const user =
      request.user as AuthenticatedUser;

    const verification =
      await this.visitVerificationsService.findById(
        user.userId,
        id,
      );

    if (!verification) {
      throw new NotFoundException(
        '방문 인증 세션을 찾을 수 없습니다.',
      );
    }

    return verification;
  }

  @ApiOperation({
    summary: '방문 인증 신청 취소',
  })
  @ApiOkResponse({
    description:
      '방문 인증 신청 취소 성공',
  })
  @ApiBadRequestResponse({
    description:
      '인증 만료 또는 이미 처리된 인증',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description:
      '방문 인증 세션을 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(
    @Req()
    request: Request,

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const user =
      request.user as AuthenticatedUser;

    const verification =
      await this.visitVerificationsService.cancel(
        user.userId,
        id,
      );

    if (!verification) {
      throw new NotFoundException(
        '방문 인증 세션을 찾을 수 없습니다.',
      );
    }

    return verification;
  }
}