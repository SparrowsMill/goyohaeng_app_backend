import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';

import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

import { RegionsService } from './regions.service';

@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  constructor(
    private readonly regionsService: RegionsService,
  ) {}

  @ApiOperation({
    summary: '지역 목록 조회',
  })
  @ApiOkResponse({
    description: '지역 목록 조회 성공',
  })
  @Get()
  findAll() {
    return this.regionsService.findAll();
  }

  @ApiOperation({
  summary: '지역별 스팟 수 조회',
})
@ApiOkResponse({
  description: '지역별 스팟 수 조회 성공',
})
@ApiNotFoundResponse({
  description: '지역을 찾을 수 없음',
})
@Get(':regionId/spot-counts')
async getSpotCounts(
  @Param('regionId', ParseIntPipe)
  regionId: number,
) {
  const result =
    await this.regionsService.getSpotCounts(
      regionId,
    );

  if (!result) {
    throw new NotFoundException(
      '지역을 찾을 수 없습니다.',
    );
  }

  return result;
}
}