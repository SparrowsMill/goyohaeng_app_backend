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

export interface BusinessContext {
  businessAccountId: number;
  placeId: number;
}

@Injectable()
export class BusinessApprovedGuard
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

            business?: BusinessContext;
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
            placeId: true,
            status: true,
          },
        });

    if (!account) {
      throw new ForbiddenException(
        '가맹점 관리자 계정이 아닙니다.',
      );
    }

    if (
      account.status !== 'APPROVED'
    ) {
      throw new ForbiddenException(
        '승인된 가맹점 관리자만 이용할 수 있습니다.',
      );
    }

    if (account.placeId === null) {
      throw new ForbiddenException(
        '관리 장소가 지정되지 않았습니다.',
      );
    }

    request.business = {
      businessAccountId:
        Number(account.id),

      placeId:
        Number(account.placeId),
    };

    return true;
  }
}