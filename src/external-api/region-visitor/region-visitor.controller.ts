import {
  Controller,
  Param,
  Post,
} from '@nestjs/common';

import { RegionVisitorService } from './region-visitor.service';

@Controller('external-api/region-visitor')
export class RegionVisitorController {
  constructor(
    private readonly regionVisitorService:
      RegionVisitorService,
  ) {}

  /**
   * 서울 방문자수 기간 수집
   *
   * 하루 테스트:
   * POST /sync-seoul/20260901/20260901
   *
   * 기간:
   * POST /sync-seoul/20260801/20260831
   */
  @Post(
    'sync-seoul/:startYmd/:endYmd',
  )
  async syncSeoul(
    @Param('startYmd')
    startYmd: string,

    @Param('endYmd')
    endYmd: string,
  ) {
    return this.regionVisitorService.syncSeoulVisitorData(
      startYmd,
      endYmd,
    );
  }
  
  @Post(
    'count-seoul/:startYmd/:endYmd',
  )
  async countSeoul(
    @Param('startYmd')
    startYmd: string,

    @Param('endYmd')
    endYmd: string,
  ) {
    return this.regionVisitorService.countSeoulVisitorData(
      startYmd,
      endYmd,
    );
  }
}