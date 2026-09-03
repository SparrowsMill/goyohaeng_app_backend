import { Injectable } from '@nestjs/common';

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  realName: string;
  email: string;
  phone: string;
  birthDate: string;
  gender?: 'MALE' | 'FEMALE';
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
  return this.users.find((user) => user.id === id);
}

  findByEmail(email: string): User | undefined {
    return this.users.find((user) => user.email === email);
  }

  create(data: CreateUserData): User {
    const user: User = {
      id: this.nextId++,
      ...data,
    };

    this.users.push(user);

    return user;
  }
}