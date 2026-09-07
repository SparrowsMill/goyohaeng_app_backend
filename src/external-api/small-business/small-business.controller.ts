import {
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';

import { SmallBusinessService } from './small-business.service';

@Controller('external-api/small-business')
export class SmallBusinessController {
  constructor(
    private readonly smallBusinessService: SmallBusinessService,
  ) {}

  /**
   * 서울 전체 상가 1페이지 테스트
   */
  @Get('seoul-test')
  async getSeoulTest() {
    return this.smallBusinessService.fetchSeoulFirstPage();
  }

  /**
   * 대분류 조회
   */
  @Get('categories/large')
  async getLargeCategories() {
    return this.smallBusinessService.fetchLargeCategories();
  }

  /**
   * 중분류 조회
   */
  @Get('categories/middle/:largeCode')
  async getMiddleCategories(
    @Param('largeCode') largeCode: string,
  ) {
    return this.smallBusinessService.fetchMiddleCategories(
      largeCode,
    );
  }

  /**
   * 소분류 조회
   */
  @Get(
    'categories/small/:largeCode/:middleCode',
  )
  async getSmallCategories(
    @Param('largeCode') largeCode: string,
    @Param('middleCode') middleCode: string,
  ) {
    return this.smallBusinessService.fetchSmallCategories(
      largeCode,
      middleCode,
    );
  }

  /**
   * 서울 + 대분류 건수
   */
  @Get('seoul-count/large/:largeCode')
  async getSeoulLargeCategoryCount(
    @Param('largeCode') largeCode: string,
  ) {
    return this.smallBusinessService.fetchSeoulCountByLargeCategory(
      largeCode,
    );
  }

  /**
   * 서울 + 중분류 건수
   */
  @Get(
    'seoul-count/middle/:largeCode/:middleCode',
  )
  async getSeoulMiddleCategoryCount(
    @Param('largeCode') largeCode: string,
    @Param('middleCode') middleCode: string,
  ) {
    return this.smallBusinessService.fetchSeoulCountByMiddleCategory(
      largeCode,
      middleCode,
    );
  }

  /**
   * 현재 실제 수집 대상 확인
   */
  @Get('selected-categories')
  getSelectedCategories() {
    return this.smallBusinessService.getSelectedCategories();
  }

  /**
   * 서울 + 선택 업종 전체 수집
   */
  @Post('sync-seoul-selected')
  async syncSeoulSelected() {
    return this.smallBusinessService.syncSelectedSeoulStores();
  }
}