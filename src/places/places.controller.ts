import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';

import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { PlacesService } from './places.service';

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
  ) {}

  @ApiOperation({
    summary: '장소 목록 조회',
  })
  @ApiOkResponse({
    description: '장소 목록 조회 성공',
  })
  @ApiOperation({
  summary: '장소 목록 조회',
})
@ApiQuery({
  name: 'regionId',
  required: false,
  type: Number,
  description: '지역 ID',
})
@ApiQuery({
  name: 'categoryId',
  required: false,
  type: Number,
  description: '카테고리 ID',
})
@ApiOkResponse({
  description: '장소 목록 조회 성공',
})
@Get()
findAll(
  @Query('regionId') regionId?: string,
  @Query('categoryId') categoryId?: string,
) {
  return this.placesService.findAll(
    regionId ? Number(regionId) : undefined,
    categoryId ? Number(categoryId) : undefined,
  );
}

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
  findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    const place = this.placesService.findById(id);

    if (!place) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return place;
  }
}