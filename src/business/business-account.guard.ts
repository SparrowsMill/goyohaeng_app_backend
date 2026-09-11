import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';

interface BusinessUser {
  userId: number;
  username: string;
  accountType: string;
}

@Injectable()
export class BusinessAccountGuard
  implements CanActivate
{
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp()
        .getRequest<
          Request & {
            user?: BusinessUser;
          }
        >();

    const user = request.user;

    if (
      !user ||
      user.accountType !== 'BUSINESS'
    ) {
      throw new ForbiddenException(
        '가맹점 관리자 계정으로 로그인해주세요.',
      );
    }

    const account =
      await this.prisma.businessAccount
        .findUnique({
          where: {
            userId:
              BigInt(user.userId),
          },

          select: {
            id: true,
          },
        });

    if (!account) {
      throw new ForbiddenException(
        '가맹점 관리자 계정이 아닙니다.',
      );
    }

    return true;
  }
}