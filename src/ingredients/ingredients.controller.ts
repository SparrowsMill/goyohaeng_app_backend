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

import { IngredientsService } from './ingredients.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Ingredients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ingredients')
export class IngredientsController {
  constructor(
    private readonly ingredientsService:
      IngredientsService,
  ) {}

  @ApiOperation({
    summary: '재료 상세 조회',
  })
  @ApiOkResponse({
    description: '재료 상세 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '재료를 찾을 수 없음',
  })
  @Get(':ingredientId')
  async findById(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'ingredientId',
      ParseIntPipe,
    )
    ingredientId: number,
  ) {
    const ingredient =
      await this.ingredientsService.findById(
        ingredientId,
        req.user.userId,
      );

    if (!ingredient) {
      throw new NotFoundException(
        '재료를 찾을 수 없습니다.',
      );
    }

    return ingredient;
  }
}