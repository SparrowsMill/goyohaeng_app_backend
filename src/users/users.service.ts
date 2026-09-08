import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

export interface User {
  id: number;
  username: string;
  passwordHash: string;

  realName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;

  promotionNotificationEnabled: boolean;
  nearbyNotificationEnabled: boolean;
  recordNotificationEnabled: boolean;

  status: string;
  deletedAt: Date | null;
}

interface CreateUserData {
  username: string;
  passwordHash: string;
  realName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender?: 'MALE' | 'FEMALE';
}

interface UpdateUserData {
  realName?: string;
  birthDate?: string;
  gender?: 'MALE' | 'FEMALE';

  promotionNotificationEnabled?: boolean;
  nearbyNotificationEnabled?: boolean;
  recordNotificationEnabled?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findByUsername(
    username: string,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findUnique({
        where: {
          username,
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async findById(
    id: number,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findFirst({
        where: {
          id: BigInt(id),
          status: 'ACTIVE',
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async findByEmail(
    email: string,
  ): Promise<User | undefined> {
    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    return user
      ? this.toUser(user)
      : undefined;
  }

  async create(
    data: CreateUserData,
  ): Promise<User> {
    const user =
      await this.prisma.user.create({
        data: {
          username: data.username,
          passwordHash:
            data.passwordHash,

          realName: data.realName,
          email: data.email,
          phone: data.phone,

          birthDate:
            this.stringToDate(
              data.birthDate,
            ),

          gender: data.gender,

          status: 'ACTIVE',
        },
      });

    return this.toUser(user);
  }

  async update(
    id: number,
    data: UpdateUserData,
  ): Promise<User | undefined> {
    const existingUser =
      await this.findById(id);

    if (!existingUser) {
      return undefined;
    }

    const user =
      await this.prisma.user.update({
        where: {
          id: BigInt(id),
        },

        data: {
          ...(data.realName !==
            undefined && {
            realName: data.realName,
          }),

          ...(data.birthDate !==
            undefined && {
            birthDate:
              this.stringToDate(
                data.birthDate,
              ),
          }),

          ...(data.gender !==
            undefined && {
            gender: data.gender,
          }),

          ...(data
            .promotionNotificationEnabled !==
            undefined && {
            promotionNotificationEnabled:
              data
                .promotionNotificationEnabled,
          }),

          ...(data
            .nearbyNotificationEnabled !==
            undefined && {
            nearbyNotificationEnabled:
              data
                .nearbyNotificationEnabled,
          }),

          ...(data
            .recordNotificationEnabled !==
            undefined && {
            recordNotificationEnabled:
              data
                .recordNotificationEnabled,
          }),

          updatedAt: new Date(),
        },
      });

    return this.toUser(user);
  }

  async changePassword(
    id: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user =
      await this.findById(id);

    if (!user) {
      return false;
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new BadRequestException(
        '현재 비밀번호가 올바르지 않습니다.',
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        10,
      );

    await this.prisma.user.update({
      where: {
        id: BigInt(id),
      },

      data: {
        passwordHash:
          newPasswordHash,
        updatedAt: new Date(),
      },
    });

    return true;
  }

  async softDelete(
    id: number,
  ): Promise<boolean> {
    const user =
      await this.findById(id);

    if (!user) {
      return false;
    }

    await this.prisma.user.update({
      where: {
        id: BigInt(id),
      },

      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return true;
  }

  private stringToDate(
    date: string,
  ): Date {
    return new Date(
      `${date}T00:00:00.000Z`,
    );
  }

  private dateToString(
    date: Date | null,
  ): string | null {
    if (!date) {
      return null;
    }

    return date
      .toISOString()
      .slice(0, 10);
  }

  private toUser(user: {
    id: bigint;
    username: string;
    passwordHash: string;
    realName: string | null;
    email: string | null;
    phone: string | null;
    birthDate: Date | null;
    gender: string | null;

    promotionNotificationEnabled: boolean;
    nearbyNotificationEnabled: boolean;
    recordNotificationEnabled: boolean;

    status: string;
    deletedAt: Date | null;
  }): User {
    return {
      id: Number(user.id),

      username: user.username,
      passwordHash:
        user.passwordHash,

      realName: user.realName,
      email: user.email,
      phone: user.phone,

      birthDate:
        this.dateToString(
          user.birthDate,
        ),

      gender: user.gender,

      promotionNotificationEnabled:
        user
          .promotionNotificationEnabled,

      nearbyNotificationEnabled:
        user
          .nearbyNotificationEnabled,

      recordNotificationEnabled:
        user
          .recordNotificationEnabled,

      status: user.status,
      deletedAt: user.deletedAt,
    };
  }
}