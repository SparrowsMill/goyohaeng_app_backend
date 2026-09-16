import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import {
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';

import {
  ChangePasswordDto,
} from '../users/dto/change-password.dto';

import {
  UsersService,
} from '../users/users.service';

import {
  BusinessAccountGuard,
} from './business-account.guard';

interface BusinessUser {
  userId: number;
  username: string;
  accountType: string;
}

interface BusinessRequest
  extends Request {
  user: BusinessUser;
}

@ApiTags('Business Account')
@ApiBearerAuth()
@Controller('business/me')
@UseGuards(
  JwtAuthGuard,
  BusinessAccountGuard,
)
export class BusinessAccountSettingsController {
  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  @Patch('password')
  @ApiOperation({
    summary:
      '가맹점 관리자 비밀번호 변경',
  })
  async changePassword(
    @Req()
    request: BusinessRequest,

    @Body()
    dto: ChangePasswordDto,
  ) {
    const changed =
      await this.usersService.changePassword(
        request.user.userId,
        dto.currentPassword,
        dto.newPassword,
      );

    if (!changed) {
      throw new NotFoundException(
        '사용자를 찾을 수 없습니다.',
      );
    }

    return {
      message:
        '비밀번호가 변경되었습니다.',
    };
  }

  @Delete()
  @ApiOperation({
    summary:
      '가맹점 관리자 계정 탈퇴',
  })
  async deleteAccount(
    @Req()
    request: BusinessRequest,
  ) {
    const deleted =
      await this.usersService.deleteAccount(
        request.user.userId,
      );

    if (!deleted) {
      throw new NotFoundException(
        '사용자를 찾을 수 없습니다.',
      );
    }

    return {
      message:
        '가맹점 관리자 계정이 탈퇴 처리되었습니다.',
    };
  }
}