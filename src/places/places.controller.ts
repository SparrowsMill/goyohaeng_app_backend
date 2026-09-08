import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { GetPlacesQueryDto } from './dto/get-places-query.dto';
import { PlacesService } from './places.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
  ) {}

  // 장소 목록 조회
  @ApiOperation({
    summary: '장소 목록 조회',
  })
  @ApiOkResponse({
    description: '장소 목록 조회 성공',
  })
  @Get()
  findAll(
    @Query() query: GetPlacesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return this.placesService.findAll(
      query.regionId,
      query.categoryId,
      page,
      limit,
    );
  }

  // 장소 방문 여부 조회
  @ApiOperation({
    summary: '장소 방문 여부 조회',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: '장소 방문 여부 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id/visit-status')
  async getVisitStatus(
    @Req()
    request: Request & {
      user: AuthenticatedUser;
    },
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    try {
      return await this.placesService.getVisitStatus(
        request.user.userId,
        id,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PLACE_NOT_FOUND'
      ) {
        throw new NotFoundException(
          '장소를 찾을 수 없습니다.',
        );
      }

      throw error;
    }
  }

  // 장소 상세 조회
  @ApiOperation({
    summary: '장소 상세 조회',
  })
  @ApiOkResponse({
    description: '장소 상세 조회 성공',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe)
    id: number,
  ) {
    const place =
      await this.placesService.findById(id);

    if (!place) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return place;
  }
}