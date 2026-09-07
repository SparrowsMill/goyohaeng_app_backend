import { Controller, Get } from '@nestjs/common';

import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
  ) {}

  @ApiOperation({
    summary: '장소 카테고리 목록 조회',
  })
  @ApiOkResponse({
    description: '카테고리 목록 조회 성공',
  })
  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }
}