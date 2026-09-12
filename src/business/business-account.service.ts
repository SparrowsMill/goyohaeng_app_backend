import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessAccountService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getApprovalStatus(
    userId: number,
  ) {
    const account =
      await this.prisma.businessAccount
        .findUnique({
          where: {
            userId: BigInt(userId),
          },

          include: {
            place: {
              select: {
                id: true,
                name: true,
                roadAddress: true,
              },
            },
          },
        });

    if (!account) {
      throw new NotFoundException(
        '가맹점 관리자 계정을 찾을 수 없습니다.',
      );
    }

    return {
      status: account.status,

      rejectionReason:
        account.rejectionReason,

      submittedAt:
        account.createdAt,

      reviewedAt:
        account.reviewedAt,

      approvedAt:
        account.approvedAt,

      place: account.place
        ? {
            id: Number(
              account.place.id,
            ),

            name:
              account.place.name,

            roadAddress:
              account.place
                .roadAddress,
          }
        : null,
    };
  }

  async getMyAccount(
    userId: number,
  ) {
    const account =
      await this.prisma.businessAccount
        .findUnique({
          where: {
            userId: BigInt(userId),
          },

          include: {
            user: {
              select: {
                id: true,
                username: true,
                realName: true,
                birthDate: true,
                phone: true,
                email: true,
              },
            },

            place: {
              select: {
                id: true,
                name: true,
                roadAddress: true,
              },
            },
          },
        });

    if (!account) {
      throw new NotFoundException(
        '가맹점 관리자 계정을 찾을 수 없습니다.',
      );
    }

    return {
      id: Number(account.id),

      status: account.status,

      rejectionReason:
        account.rejectionReason,

      account: {
        userId: Number(
          account.user.id,
        ),

        username:
          account.user.username,

        realName:
          account.user.realName,

        birthDate:
          account.user.birthDate,

        phone:
          account.user.phone,

        email:
          account.user.email,
      },

      business: {
        businessName:
          account.businessName,

        businessRegistrationNo:
          account
            .businessRegistrationNo,

        submittedStoreAddress:
          account
            .submittedStoreAddress,
      },

      place: account.place
        ? {
            id: Number(
              account.place.id,
            ),

            name:
              account.place.name,

            roadAddress:
              account.place
                .roadAddress,
          }
        : null,
    };
  }
}