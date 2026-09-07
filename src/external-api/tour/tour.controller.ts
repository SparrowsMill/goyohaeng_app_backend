import { Controller, Get, Post } from '@nestjs/common';

import { TourService } from './tour.service';

@Controller('external-api/tour')
export class TourController {
  constructor(private readonly tourService: TourService) {}

  /**
   * 전국 시/도 코드 조회
   */
  @Get('area-codes')
  async getAreaCodes() {
    return this.tourService.fetchAreaCodes();
  }

  /**
   * 서울특별시의 TourAPI areaCode 확인
   */
  @Get('seoul-area-code')
  async getSeoulAreaCode() {
    return this.tourService.fetchSeoulAreaCode();
  }

  @Get('seoul-district-codes')
  async getSeoulDistrictCodes() {
    return this.tourService.fetchSeoulDistrictCodes();
  }

  @Get('sync-seoul-region-codes')
  async syncSeoulRegionCodes() {
    return this.tourService.syncSeoulRegionCodes();
  }

  @Get('seoul-places-test')
  async getSeoulPlacesTest() {
    return this.tourService.fetchSeoulPlacesFirstPage();
  }
  
  @Post('sync-seoul-places')
  async syncSeoulPlaces() {
    return this.tourService.syncAllSeoulPlaces();
  }
}