import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { BusinessSignupDto } from './dto/business-signup.dto';
import { BusinessLoginDto } from './dto/business-login.dto';

@Injectable()
export class BusinessAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async checkUsername(username: string) {
    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      throw new BadRequestException(
        '아이디를 입력해주세요.',
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          username: trimmedUsername,
        },
        select: {
          id: true,
        },
      });

    return {
      username: trimmedUsername,
      available: !existingUser,
    };
  }

  async signup(dto: BusinessSignupDto) {
    const username = dto.username.trim();
    const email = dto.email.trim();

    const existingUsername =
      await this.prisma.user.findUnique({
        where: {
          username,
        },
        select: {
          id: true,
        },
      });

    if (existingUsername) {
      throw new ConflictException(
        '이미 사용 중인 아이디입니다.',
      );
    }

    const existingEmail =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

    if (existingEmail) {
      throw new ConflictException(
        '이미 사용 중인 이메일입니다.',
      );
    }

    const place =
      await this.prisma.place.findFirst({
        where: {
          id: BigInt(dto.placeId),
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          roadAddress: true,
        },
      });

    if (!place) {
      throw new NotFoundException(
        '관리할 장소를 찾을 수 없습니다.',
      );
    }

    const existingBusinessAccount =
      await this.prisma.businessAccount.findUnique({
        where: {
          placeId: place.id,
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (existingBusinessAccount) {
      throw new ConflictException(
        '이미 관리자 신청이 존재하는 장소입니다.',
      );
    }

    const passwordHash =
      await bcrypt.hash(dto.password, 10);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const user =
            await tx.user.create({
              data: {
                username,
                passwordHash,
                realName: dto.realName,
                email,
                phone: dto.phone ?? null,

                // 사업자 여부는 BusinessAccount 존재 여부로 판단
                role: 'USER',
                status: 'ACTIVE',
              },
            });

          const businessAccount =
            await tx.businessAccount.create({
              data: {
                userId: user.id,
                placeId: place.id,
                businessName:
                  dto.businessName,
                businessRegistrationNo:
                  dto.businessRegistrationNo,
                submittedStoreAddress:
                  dto.submittedStoreAddress,

                status: 'PENDING',
              },
            });

          return {
            user,
            businessAccount,
          };
        },
      );

    return {
      userId: Number(result.user.id),

      businessAccountId:
        Number(result.businessAccount.id),

      username:
        result.user.username,

      place: {
        id: Number(place.id),
        name: place.name,
        roadAddress: place.roadAddress,
      },

      approvalStatus:
        result.businessAccount.status,

      message:
        '가맹점 가입 신청이 완료되었습니다.',
    };
  }

  async login(dto: BusinessLoginDto) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          username: dto.username,
        },

        include: {
          businessAccount: {
            include: {
              place: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

    if (
      !user ||
      user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (!user.businessAccount) {
      throw new UnauthorizedException(
        '가맹점 관리자 계정이 아닙니다.',
      );
    }

    const accessToken =
      await this.jwtService.signAsync({
        sub: Number(user.id),
        username: user.username,
        accountType: 'BUSINESS',
      });

    return {
      accessToken,

      user: {
        id: Number(user.id),
        username: user.username,
        realName: user.realName,
      },

      businessAccount: {
        id: Number(
          user.businessAccount.id,
        ),

        status:
          user.businessAccount.status,

        rejectionReason:
          user.businessAccount
            .rejectionReason,

        place: {
          id: Number(
            user.businessAccount.place.id,
          ),

          name:
            user.businessAccount.place.name,
        },
      },
    };
  }
}