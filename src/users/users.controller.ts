import {
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

interface AuthenticatedUser {
  userId: number;
  username: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
    };
  }
}