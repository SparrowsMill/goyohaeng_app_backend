import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
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
}