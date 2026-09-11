import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Delete,
} from '@nestjs/common';

import {
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
    private readonly recordsService:
      RecordsService,
  ) {}

  // ==============================
  // 발자국 작성
  // ==============================

  @ApiOperation({
    summary: '발자국 작성',
  })
  @ApiCreatedResponse({
    description:
      '발자국 작성 성공',
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
  })
  @ApiOkResponse({
    description:
      '발자국 상세 조회 성공',
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
  })
  @ApiOkResponse({
    description:
      '발자국 수정 성공',
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

  @ApiBearerAuth()
@ApiOperation({
  summary: '발자국 삭제',
})
@ApiOkResponse({
  description:
    '발자국 삭제 성공',
})
@ApiUnauthorizedResponse({
  description:
    '로그인이 필요함',
})
@ApiNotFoundResponse({
  description:
    '발자국을 찾을 수 없음',
})
@UseGuards(JwtAuthGuard)
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
  })
  @ApiOkResponse({
    description:
      '발자국 목록 조회 성공',
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

    @Query(
      'page',
      new DefaultValuePipe(1),
      ParseIntPipe,
    )
    page: number,

    @Query(
      'limit',
      new DefaultValuePipe(20),
      ParseIntPipe,
    )
    limit: number,
  ) {
    return this.recordsService.findAll(
      req.user.userId,
      page,
      limit,
    );
  }
}