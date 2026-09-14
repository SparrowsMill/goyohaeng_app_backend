import {
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { GetPlacesQueryDto } from './dto/get-places-query.dto';
import { PlacesService } from './places.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Places')
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
  ) {}

  // =========================================================
  // 장소 목록 조회
  // =========================================================

  @ApiOperation({
    summary: '장소 목록 조회',
  })
  @ApiOkResponse({
    description: '장소 목록 조회 성공',
  })
  @Get()
  findAll(
    @Query() query: GetPlacesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return this.placesService.findAll(
      query.regionId,
      query.categoryId,
      page,
      limit,
    );
  }

  // =========================================================
// GAP Score 장소 랭킹 조회
// =========================================================

@ApiOperation({
  summary: 'GAP Score 장소 랭킹 조회',
})
@ApiOkResponse({
  description:
    '최신 GAP Score 기준 장소 랭킹 조회 성공',
  schema: {
    type: 'object',
    properties: {
      run: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },

      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,

          properties: {
            isOpenNow: {
              type: 'boolean',
              nullable: true,
              example: true,
              description:
                'Asia/Seoul 기준 요청 시점의 영업 여부. true=영업 중, false=영업 종료·정기휴무·특별휴무·휴게시간, null=영업시간 정보가 없거나 불완전하여 판단 불가',
            },

            verificationAvailable: {
              type: 'boolean',
              example: true,
              description:
                '방문 인증 가능 여부. isOpenNow와는 독립적인 값',
            },
          },
        },
      },

      page: {
        type: 'number',
        example: 1,
      },

      limit: {
        type: 'number',
        example: 20,
      },

      total: {
        type: 'number',
        example: 100,
      },

      totalPages: {
        type: 'number',
        example: 5,
      },
    },

    example: {
      run: {
        id: 1,
        formulaVersion: 'v1',
        dataStage: 'PRODUCTION',
        calculatedAt:
          '2026-09-14T10:00:00.000Z',
      },

      items: [
        {
          rank: 1,
          placeId: 4155,
          placeName:
            '남대문 종합상가',
          categoryId: 10,
          regionId: 1,
          roadAddress:
            '서울특별시 중구 ...',
          verificationAvailable:
            true,
          isOpenNow: true,
          imageUrl: null,
          gapScore: 0.82,
          onlineScore: 0.73,
          offlineScore: 0.91,
          explanation:
            '상대적으로 덜 알려진 장소입니다.',
        },
      ],

      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    },
  },
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
@ApiQuery({
  name: 'page',
  required: false,
  type: Number,
  example: 1,
})
@ApiQuery({
  name: 'limit',
  required: false,
  type: Number,
  example: 20,
})
@Get('gap/rankings')
async getGapRankings(
  @Query(
    'regionId',
    new ParseIntPipe({
      optional: true,
    }),
  )
  regionId?: number,

  @Query(
    'categoryId',
    new ParseIntPipe({
      optional: true,
    }),
  )
  categoryId?: number,

  @Query(
    'page',
    new DefaultValuePipe(1),
    ParseIntPipe,
  )
  page: number = 1,

  @Query(
    'limit',
    new DefaultValuePipe(20),
    ParseIntPipe,
  )
  limit: number = 20,
) {
  return this.placesService.getGapRankings(
    regionId,
    categoryId,
    page,
    limit,
  );
}

// =========================================================
// GAP Score 지도 조회
// =========================================================

@ApiOperation({
  summary: 'GAP Score 지도 데이터 조회',
})
@ApiOkResponse({
  description:
    '최신 GAP Score 기준 지도 마커 조회 성공',
  schema: {
    type: 'object',

    properties: {
      run: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },

      items: {
        type: 'array',

        items: {
          type: 'object',
          additionalProperties: true,

          properties: {
            isOpenNow: {
              type: 'boolean',
              nullable: true,
              example: false,
              description:
                'Asia/Seoul 기준 요청 시점의 영업 여부. true=영업 중, false=영업 종료·정기휴무·특별휴무·휴게시간, null=영업시간 정보가 없거나 불완전하여 판단 불가',
            },

            verificationAvailable: {
              type: 'boolean',
              example: true,
              description:
                '방문 인증 가능 여부. isOpenNow와는 독립적인 값',
            },
          },
        },
      },

      total: {
        type: 'number',
        example: 1,
      },
    },

    example: {
      run: {
        id: 1,
        formulaVersion: 'v1',
        dataStage: 'PRODUCTION',
        calculatedAt:
          '2026-09-14T10:00:00.000Z',
      },

      items: [
        {
          placeId: 4155,
          placeName:
            '남대문 종합상가',
          categoryId: 10,
          regionId: 1,
          latitude: 37.56,
          longitude: 126.98,
          roadAddress:
            '서울특별시 중구 ...',
          verificationAvailable:
            true,
          isOpenNow: false,
          gapScore: 0.82,
          onlineScore: 0.73,
          offlineScore: 0.91,
        },
      ],

      total: 1,
    },
  },
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
@Get('gap/map')
async getGapMap(
  @Query(
    'regionId',
    new ParseIntPipe({
      optional: true,
    }),
  )
  regionId?: number,

  @Query(
    'categoryId',
    new ParseIntPipe({
      optional: true,
    }),
  )
  categoryId?: number,
) {
  return this.placesService.getGapMap(
    regionId,
    categoryId,
  );
}

  // =========================================================
  // 장소 방문 여부 조회
  // =========================================================

  @ApiOperation({
    summary: '장소 방문 여부 조회',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: '장소 방문 여부 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Get(':id/visit-status')
  async getVisitStatus(
    @Req()
    request: Request & {
      user: AuthenticatedUser;
    },

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    try {
      return await this.placesService.getVisitStatus(
        request.user.userId,
        id,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PLACE_NOT_FOUND'
      ) {
        throw new NotFoundException(
          '장소를 찾을 수 없습니다.',
        );
      }

      throw error;
    }
  }

  // =========================================================
  // 장소 트렌드 요약 조회
  // =========================================================

  @ApiOperation({
    summary: '장소 트렌드 요약 조회',
  })
  @ApiOkResponse({
    description: '장소 트렌드 요약 조회 성공',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @Get(':id/trends')
  async getTrendSummary(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const trend =
      await this.placesService.getTrendSummary(
        id,
      );

    if (!trend) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return trend;
  }

  // =========================================================
  // 트렌드 최초 조회 보상
  // =========================================================

  @ApiBearerAuth()
  @ApiOperation({
    summary: '트렌드 최초 조회 보상 지급',
  })
  @ApiOkResponse({
    description:
      '트렌드 최초 조회 보상 처리 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Post(':id/trends/first-view')
  async rewardTrendFirstView(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const result =
      await this.placesService.rewardTrendFirstView(
        req.user.userId,
        id,
      );

    if (!result) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return result;
  }

  // =========================================================
  // 장소 즐겨찾기 추가
  // =========================================================

  @ApiBearerAuth()
  @ApiOperation({
    summary: '장소 즐겨찾기 추가',
  })
  @ApiOkResponse({
    description: '즐겨찾기 추가 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Post(':id/favorite')
  async addFavorite(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const result =
      await this.placesService.addFavorite(
        req.user.userId,
        id,
      );

    if (!result) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return result;
  }

  // =========================================================
  // 장소 즐겨찾기 해제
  // =========================================================

  @ApiBearerAuth()
  @ApiOperation({
    summary: '장소 즐겨찾기 해제',
  })
  @ApiOkResponse({
    description: '즐겨찾기 해제 성공',
  })
  @ApiUnauthorizedResponse({
    description: '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @UseGuards(JwtAuthGuard)
  @Delete(':id/favorite')
  async removeFavorite(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const result =
      await this.placesService.removeFavorite(
        req.user.userId,
        id,
      );

    if (!result) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return result;
  }

  // =========================================================
  // 장소 GAP Score 조회
  // =========================================================

  @ApiOperation({
    summary: '장소 GAP Score 조회',
  })
  @ApiOkResponse({
    description:
      '장소의 최신 GAP Score 조회 성공',
  })
  @ApiNotFoundResponse({
    description: '장소를 찾을 수 없음',
  })
  @Get(':id/gap')
  async getGapScore(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    const result =
      await this.placesService.getGapScore(
        id,
      );

    if (!result) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    return result;
  }

// =========================================================
// GAP 기반 연관 관광지 추천
// =========================================================

@ApiOperation({
  summary: 'GAP 기반 연관 관광지 추천',
})
@ApiOkResponse({
  description:
    '같은 지역·카테고리의 유사 GAP 관광지 추천 성공',
  schema: {
    type: 'object',

    properties: {
      basePlace: {
        type: 'object',
        additionalProperties: true,
      },

      run: {
        type: 'object',
        nullable: true,
        additionalProperties: true,
      },

      available: {
        type: 'boolean',
        example: true,
      },

      items: {
        type: 'array',

        items: {
          type: 'object',
          additionalProperties: true,

          properties: {
            isOpenNow: {
              type: 'boolean',
              nullable: true,
              example: null,
              description:
                'Asia/Seoul 기준 요청 시점의 영업 여부. true=영업 중, false=영업 종료·정기휴무·특별휴무·휴게시간, null=영업시간 정보가 없거나 불완전하여 판단 불가',
            },
          },
        },
      },
    },

    example: {
      basePlace: {
        id: 4155,
        name:
          '남대문 종합상가',
        categoryId: 10,
        regionId: 1,
        gapScore: 0.82,
      },

      run: {
        id: 1,
        formulaVersion: 'v1',
        dataStage: 'PRODUCTION',
        calculatedAt:
          '2026-09-14T10:00:00.000Z',
      },

      available: true,

      items: [
        {
          placeId: 4156,
          placeName:
            '추천 장소',
          categoryId: 10,
          regionId: 1,
          roadAddress:
            '서울특별시 중구 ...',
          imageUrl: null,
          gapScore: 0.8,
          gapDifference: 0.02,
          onlineScore: 0.7,
          offlineScore: 0.9,

          isOpenNow: null,
        },
      ],
    },
  },
})
@ApiNotFoundResponse({
  description:
    '장소를 찾을 수 없음',
})
@ApiQuery({
  name: 'limit',
  required: false,
  type: Number,
  example: 5,
  description:
    '추천 장소 개수',
})
@Get(':id/recommendations')
async getRecommendations(
  @Param(
    'id',
    ParseIntPipe,
  )
  id: number,

  @Query(
    'limit',
    new DefaultValuePipe(5),
    ParseIntPipe,
  )
  limit: number = 5,
) {
  const result =
    await this.placesService.getRecommendations(
      id,
      limit,
    );

  if (!result) {
    throw new NotFoundException(
      '장소를 찾을 수 없습니다.',
    );
  }

  return result;
}

// =========================================================
// 장소 상세 조회
// 반드시 범용 :id 라우트는 아래쪽에 둠
// =========================================================

@ApiBearerAuth()
@ApiOperation({
  summary: '장소 상세 조회',
})
@ApiOkResponse({
  description:
    '장소 상세 조회 성공',
  schema: {
    type: 'object',
    additionalProperties: true,

    properties: {
      isOpenNow: {
        type: 'boolean',
        nullable: true,
        example: true,
        description:
          'Asia/Seoul 기준 요청 시점의 영업 여부. true=현재 영업 중, false=영업시간 외·정기휴무·특별휴무·휴게시간, null=영업시간 정보가 없거나 불완전하여 판단할 수 없음',
      },

      operatingHours: {
        type: 'array',
        description:
          '요일별 기본 영업시간',
        items: {
          type: 'object',
          additionalProperties: true,
        },
      },

      verification: {
        type: 'object',
        nullable: true,
        description:
          '방문 인증 설정. isOpenNow와 독립적으로 동작함',
        additionalProperties: true,
      },
    },

    example: {
      id: 4155,
      name:
        '남대문 종합상가',

      isOpenNow: true,

      operatingHours: [
        {
          dayOfWeek: 1,
          isClosed: false,
          openTime: '09:00',
          closeTime: '18:00',
          breakStartTime: null,
          breakEndTime: null,
        },
      ],

      verification: {
        enabled: true,
        controlMode: 'MANUAL',
        hoursMode:
          'SAME_AS_OPERATING',
        codeValidMinutes: 30,
      },

      isFavorite: false,
    },
  },
})
@ApiUnauthorizedResponse({
  description:
    '로그인이 필요함',
})
@ApiNotFoundResponse({
  description:
    '장소를 찾을 수 없음',
})
@UseGuards(JwtAuthGuard)
@Get(':id')
async findById(
  @Req()
  req: {
    user: AuthenticatedUser;
  },

  @Param(
    'id',
    ParseIntPipe,
  )
  id: number,
) {
  const place =
    await this.placesService.findById(
      id,
      req.user.userId,
    );

  if (!place) {
    throw new NotFoundException(
      '장소를 찾을 수 없습니다.',
    );
  }

  return place;
}
}