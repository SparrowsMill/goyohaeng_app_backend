import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  realName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender?: 'MALE' | 'FEMALE';

  promotionNotificationEnabled: boolean;
  nearbyNotificationEnabled: boolean;
  recordNotificationEnabled: boolean;

  status:
    | 'ACTIVE'
    | 'PENDING'
    | 'SUSPENDED'
    | 'DISABLED'
    | 'DELETED';

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

@Injectable()
export class UsersService {
  private readonly users: User[] = [];
  private nextId = 1;

  findByUsername(username: string): User | undefined {
    return this.users.find((user) => user.username === username);
  }

  findById(id: number): User | undefined {
    return this.users.find(
      (user) => user.id === id && user.status === 'ACTIVE',
    );
  }

  findByEmail(email: string): User | undefined {
    return this.users.find((user) => user.email === email);
  }

  create(data: CreateUserData): User {
    const user: User = {
      id: this.nextId++,
      ...data,

      promotionNotificationEnabled: true,
      nearbyNotificationEnabled: true,
      recordNotificationEnabled: true,

      status: 'ACTIVE',
      deletedAt: null,
    };

    this.users.push(user);

    return user;
  }

  update(
    id: number,
    data: Partial<Omit<User, 'id' | 'username' | 'passwordHash'>>,
  ): User | undefined {
    const user = this.findById(id);

    if (!user) {
      return undefined;
    }

    Object.assign(user, data);

    return user;
  }

  // 비밀번호 변경
  async changePassword(
    id: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = this.findById(id);

    if (!user) {
      return false;
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new BadRequestException(
        '현재 비밀번호가 올바르지 않습니다.',
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);

    return true;
  }

  // 회원탈퇴
  softDelete(id: number): boolean {
    const user = this.users.find((user) => user.id === id);

    if (!user || user.status === 'DELETED') {
      return false;
    }

    user.status = 'DELETED';
    user.deletedAt = new Date();

    return true;
  }
}