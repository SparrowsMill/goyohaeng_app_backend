import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
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

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { FoodsService } from './foods.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Food Histories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('food-histories')
export class FoodHistoriesController {
  constructor(
    private readonly foodsService: FoodsService,
  ) {}


  @Get(':historyId')
  async findHistoryById(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'historyId',
      ParseIntPipe,
    )
    historyId: number,
  ) {
    const history =
      await this.foodsService.findHistoryById(
        historyId,
        req.user.userId,
      );

    if (!history) {
      throw new NotFoundException(
        '음식 히스토리를 찾을 수 없습니다.',
      );
    }

    return history;
  }
}