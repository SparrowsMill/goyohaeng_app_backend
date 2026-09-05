import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 내 정보 조회
  @ApiOperation({
    summary: '내 정보 조회',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: '내 정보 조회 성공',
  })
  @ApiUnauthorizedResponse({
    description: 'JWT가 없거나 유효하지 않음',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyProfile(
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    const user = this.usersService.findById(req.user.userId);

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      gender: user.gender,

      promotionNotificationEnabled:
      user.promotionNotificationEnabled,

      nearbyNotificationEnabled:
      user.nearbyNotificationEnabled,

      recordNotificationEnabled:
      user.recordNotificationEnabled,
    };
  }

  // 내 정보 수정
  @ApiOperation({
    summary: '내 정보 수정',
  })
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'JWT가 없거나 유효하지 않음',
  })
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMyProfile(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const user = this.usersService.update(
      req.user.userId,
      updateProfileDto,
    );

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      email: user.email,
      phone: user.phone,
      birthDate: user.birthDate,
      gender: user.gender,
    };
  }

  @ApiOperation({
  summary: '알림 설정 수정',
})
@ApiBearerAuth()
@ApiOkResponse({
  description: '알림 설정 수정 성공',
})
@ApiUnauthorizedResponse({
  description: 'JWT가 없거나 유효하지 않음',
})
@UseGuards(JwtAuthGuard)
@Patch('me/settings')
updateNotificationSettings(
  @Req() req: Request & { user: AuthenticatedUser },
  @Body()
  updateNotificationSettingsDto: UpdateNotificationSettingsDto,
) {
  const user = this.usersService.update(
    req.user.userId,
    updateNotificationSettingsDto,
  );

  if (!user) {
    throw new NotFoundException('사용자를 찾을 수 없습니다.');
  }

  return {
    promotionNotificationEnabled:
      user.promotionNotificationEnabled,

    nearbyNotificationEnabled:
      user.nearbyNotificationEnabled,

    recordNotificationEnabled:
      user.recordNotificationEnabled,
  };
}

@ApiOperation({
  summary: '비밀번호 변경',
})
@ApiBearerAuth()
@ApiOkResponse({
  description: '비밀번호 변경 성공',
})
@ApiBadRequestResponse({
  description: '현재 비밀번호 불일치 또는 새 비밀번호 형식 오류',
})
@ApiUnauthorizedResponse({
  description: 'JWT가 없거나 유효하지 않음',
})
@UseGuards(JwtAuthGuard)
@Patch('me/password')
async changePassword(
  @Req() req: Request & { user: AuthenticatedUser },
  @Body() changePasswordDto: ChangePasswordDto,
) {
  const changed = await this.usersService.changePassword(
    req.user.userId,
    changePasswordDto.currentPassword,
    changePasswordDto.newPassword,
  );

  if (!changed) {
    throw new NotFoundException('사용자를 찾을 수 없습니다.');
  }

  return {
    message: '비밀번호가 변경되었습니다.',
  };
}

// 회원탈퇴
@ApiOperation({
  summary: '회원탈퇴',
})
@ApiBearerAuth()
@ApiOkResponse({
  description: '회원탈퇴 성공',
})
@ApiUnauthorizedResponse({
  description: 'JWT가 없거나 유효하지 않음',
})
@UseGuards(JwtAuthGuard)
@Delete('me')
deleteMyAccount(
  @Req() req: Request & { user: AuthenticatedUser },
) {
  const deleted = this.usersService.softDelete(
    req.user.userId,
  );

  if (!deleted) {
    throw new NotFoundException(
      '사용자를 찾을 수 없습니다.',
    );
  }

  return {
    message: '회원탈퇴가 완료되었습니다.',
  };
}
}