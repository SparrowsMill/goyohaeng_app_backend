import {
  Controller,
  Post,
} from '@nestjs/common';

import { NaverService } from './naver.service';

@Controller('external-api/naver')
export class NaverController {
  constructor(
    private readonly naverService: NaverService,
  ) {}

  @Post('sync-tour-place-trends-test')
  async syncTourPlaceTrendsTest() {
    return this.naverService.syncTourPlaceSearchTrends(
      undefined,
      [
        226n,  // 광장시장
        107n,  // 덕수궁 돌담길
        2047n, // 북서울꿈의숲
        1837n, // 남산인권숲
      ],
    );
  }

  @Post('sync-tour-place-trends')
  async syncTourPlaceTrends() {
    return this.naverService.syncTourPlaceSearchTrends();
  }

  @Post('test-single-gwangjang')
  async testSingleGwangjang() {
    return this.naverService.syncTourPlaceSearchTrends(
      undefined,
      [226n], // 광장시장
    );
  }

  @Post('test-without-gwangjang')
  async testWithoutGwangjang() {
    return this.naverService.syncTourPlaceSearchTrends(
      undefined,
      [
        107n,  // 덕수궁 돌담길
        2047n, // 북서울꿈의숲
        1837n, // 남산인권숲
      ],
    );
}
}