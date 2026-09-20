import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { GetRecordsQueryDto } from './dto/get-records-query.dto';

import { RecordsService } from './records.service';



interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('records')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
  ) {}

  // ==============================
  // 발자국 작성
  // ==============================

  @ApiOperation({
    summary: '발자국 작성',
    description:
      '등록 장소(placeId) 또는 수동 장소명(manualPlaceName)을 선택하여 발자국을 작성합니다. 둘은 동시에 값을 가질 수 없습니다.',
  })
  @ApiCreatedResponse({
    description:
      '발자국 작성 성공',
    schema: {
      example: {
        recordId: 123,
        message:
          '발자국이 기록되었습니다.',
        record: {
          id: 123,
          date: '2026-09-14',

          place: null,

          manualPlaceName:
            '집 근처 작은 공원',

          food: null,

          title:
            '저녁 산책',

          body:
            '조용히 산책하며 하루를 마무리했어요.',

          images: [],

          createdAt:
            '2026-09-14T10:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      '잘못된 요청. placeId와 manualPlaceName은 동시에 값을 가질 수 없으며, 수동 장소명은 최대 100자입니다.',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Post()
  async create(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Body()
    dto: CreateRecordDto,
  ) {
    return this.recordsService.create(
      req.user.userId,
      dto,
    );
  }

  // ==============================
  // 발자국 달력
  // ==============================

  @ApiOperation({
    summary: '발자국 달력 조회',
  })
  @ApiOkResponse({
    description:
      '월별 발자국 날짜 조회 성공',
    schema: {
      example: {
        year: 2026,
        month: 9,

        recordDays: [
          {
            date: '2026-09-14',
            recordCount: 2,
          },
          {
            date: '2026-09-15',
            recordCount: 1,
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Get('calendar')
  async getCalendar(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Query(
      'year',
      ParseIntPipe,
    )
    year: number,

    @Query(
      'month',
      ParseIntPipe,
    )
    month: number,
  ) {
    return this.recordsService.getCalendar(
      req.user.userId,
      year,
      month,
    );
  }

  // ==============================
  // 발자국 상세 조회
  // ==============================

  @ApiOperation({
    summary: '발자국 상세 조회',
    description:
      '등록 장소 기록이면 place가 객체이고 manualPlaceName은 null입니다. 수동 장소 기록이면 place는 null이고 manualPlaceName에 직접 입력한 장소명이 반환됩니다.',
  })
  @ApiOkResponse({
    description:
      '발자국 상세 조회 성공',
    schema: {
      example: {
        id: 123,

        date:
          '2026-09-14',

        place:
          null,

        manualPlaceName:
          '집 근처 작은 공원',

        food:
          null,

        visitVerificationId:
          null,

        title:
          '저녁 산책',

        body:
          '조용히 산책하며 하루를 마무리했어요.',

        images: [],

        createdAt:
          '2026-09-14T10:00:00.000Z',

        updatedAt:
          '2026-09-14T10:30:00.000Z',
      },
    },
  })
  @ApiNotFoundResponse({
    description:
      '발자국을 찾을 수 없음',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Get(':recordId')
  async findById(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'recordId',
      ParseIntPipe,
    )
    recordId: number,
  ) {
    return this.recordsService.findById(
      req.user.userId,
      recordId,
    );
  }

  // ==============================
  // 발자국 수정
  // ==============================

  @ApiOperation({
    summary: '발자국 수정',
    description:
      'placeId와 manualPlaceName은 생략하면 기존 값을 유지하고, null을 명시하면 해당 값을 해제합니다. 장소가 변경되거나 해제되면 기존 visitVerificationId 연결은 해제되지만 방문 인증 기록 자체는 유지됩니다.',
  })
  @ApiOkResponse({
    description:
      '발자국 수정 성공',
    schema: {
      example: {
        id: 123,

        date:
          '2026-09-14',

        place: {
          id: 4155,
          name:
            '남대문 종합상가',
        },

        manualPlaceName:
          null,

        food:
          null,

        visitVerificationId:
          null,

        title:
          '저녁 산책',

        body:
          '조용히 산책하며 하루를 마무리했어요.',

        images: [],

        createdAt:
          '2026-09-14T10:00:00.000Z',

        updatedAt:
          '2026-09-14T10:30:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      '잘못된 요청. placeId와 manualPlaceName은 동시에 값을 가질 수 없습니다.',
  })
  @ApiNotFoundResponse({
    description:
      '발자국을 찾을 수 없음',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Patch(':recordId')
  async update(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'recordId',
      ParseIntPipe,
    )
    recordId: number,

    @Body()
    dto: UpdateRecordDto,
  ) {
    return this.recordsService.update(
      req.user.userId,
      recordId,
      dto,
    );
  }

  // ==============================
  // 발자국 삭제
  // ==============================

  @ApiOperation({
    summary: '발자국 삭제',
  })
  @ApiOkResponse({
    description:
      '발자국 삭제 성공',
    schema: {
      example: {
        recordId: 123,
        message:
          '발자국이 삭제되었습니다.',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @ApiNotFoundResponse({
    description:
      '발자국을 찾을 수 없음',
  })
  @Delete(':recordId')
  async remove(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Param(
      'recordId',
      ParseIntPipe,
    )
    recordId: number,
  ) {
    return this.recordsService.remove(
      req.user.userId,
      recordId,
    );
  }

  // ==============================
  // 내 발자국 전체 조회
  // ==============================

   @ApiOperation({
    summary: '내 발자국 전체 조회',
    description:
      '등록 장소 기록과 수동 장소명 기록 모두 조회합니다. from/to를 전달하면 방문 날짜(visitedAt)를 기준으로 KST 기간 조회가 가능합니다.',
  })
  @ApiOkResponse({
    description:
      '발자국 목록 조회 성공',
    schema: {
      example: {
        records: [
          {
            id: 123,

            date:
              '2026-09-14',

            place:
              null,

            manualPlaceName:
              '집 근처 작은 공원',

            food:
              null,

            title:
              '저녁 산책',

            body:
              '조용히 산책하며 하루를 마무리했어요.',

            images: [],

            createdAt:
              '2026-09-14T10:00:00.000Z',

            updatedAt:
              null,
          },

          {
            id: 124,

            date:
              '2026-09-14',

            place: {
              id: 4155,

              name:
                '남대문 종합상가',
            },

            manualPlaceName:
              null,

            food:
              null,

            title:
              '시장 구경',

            body:
              '남대문을 둘러봤어요.',

            images: [],

            createdAt:
              '2026-09-14T11:00:00.000Z',

            updatedAt:
              null,
          },
        ],

        page: 1,

        limit: 20,

        total: 2,

        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'from/to 날짜 형식이 잘못되었거나, 존재하지 않는 날짜이거나, from이 to보다 늦은 경우',
  })
  @ApiUnauthorizedResponse({
    description:
      '로그인이 필요함',
  })
  @Get()
  async findAll(
    @Req()
    req: {
      user: AuthenticatedUser;
    },

    @Query()
    query: GetRecordsQueryDto,
  ) {
    return this.recordsService.findAll(
      req.user.userId,
      query.page ?? 1,
      query.limit ?? 20,
      query.from,
      query.to,
    );
  }
}