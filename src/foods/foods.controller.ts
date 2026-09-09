import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Post,
  BadRequestException,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { FoodsService } from './foods.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Foods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('foods')
export class FoodsController {
  constructor(
    private readonly foodsService: FoodsService,
  ) {}

  // 음식 목록 조회
  @ApiOperation({
    summary: '음식 목록 조회',
  })
  @ApiOkResponse({
    description: '음식 목록 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @Get()
  async findAll(
    @Req()
    req: {
      user: AuthenticatedUser;
    },
  ) {
    return this.foodsService.findAll(
      req.user.userId,
    );
  }

  // 음식 상세 조회
  @ApiOperation({
    summary: '음식 상세 조회',
  })
  @ApiOkResponse({
    description: '음식 상세 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '음식을 찾을 수 없음',
  })
  @Get(':id')
  async findById(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param('id', ParseIntPipe)
    id: number,
  ) {
    const food =
      await this.foodsService.findById(
        id,
        req.user.userId,
      );

    if (!food) {
      throw new NotFoundException(
        '음식을 찾을 수 없습니다.',
      );
    }

    return food;
  }

  // 음식 만들기
@ApiOperation({
  summary: '음식 만들기',
})
@ApiOkResponse({
  description: '음식 만들기 성공',
})
@ApiBadRequestResponse({
  description:
    '레시피가 없거나 필요한 재료가 부족함',
})
@ApiNotFoundResponse({
  description: '음식을 찾을 수 없음',
})
@Post(':id/make')
async makeFood(
  @Req()
  req: {
    user: AuthenticatedUser;
  },

  @Param('id', ParseIntPipe)
  id: number,
) {
  const result =
    await this.foodsService.makeFood(
      id,
      req.user.userId,
    );

  if (
    !result.success &&
    result.reason === 'FOOD_NOT_FOUND'
  ) {
    throw new NotFoundException(
      '음식을 찾을 수 없습니다.',
    );
  }

  if (
    !result.success &&
    result.reason === 'RECIPE_NOT_FOUND'
  ) {
    throw new BadRequestException(
      '등록된 레시피가 없습니다.',
    );
  }

  if (
    !result.success &&
    result.reason ===
      'INSUFFICIENT_INGREDIENTS'
  ) {
    throw new BadRequestException({
      message:
        '보유한 재료가 부족합니다.',

      missingIngredients:
        result.missingIngredients,
    });
  }

  return result;
}
}