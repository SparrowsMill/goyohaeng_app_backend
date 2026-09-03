import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // 아이디 중복 확인
  checkUsername(username: string) {
    if (!username || !username.trim()) {
      throw new BadRequestException('아이디를 입력해주세요.');
    }

    const user = this.usersService.findByUsername(username.trim());

    return {
      available: !user,
    };
  }

  // 회원가입
  async signup(signupDto: SignupDto) {
    const existingUser = this.usersService.findByUsername(
      signupDto.username,
    );

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    const existingEmail = this.usersService.findByEmail(
      signupDto.email,
    );

    if (existingEmail) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    // 비밀번호 암호화
    const passwordHash = await bcrypt.hash(signupDto.password, 10);

    const user = this.usersService.create({
      username: signupDto.username,
      passwordHash,
      realName: signupDto.realName,
      email: signupDto.email,
      phone: signupDto.phone,
      birthDate: signupDto.birthDate,
      gender: signupDto.gender,
    });

    return {
      userId: user.id,
      username: user.username,
      realName: user.realName,
      message: '회원가입이 완료되었습니다.',
    };
  }

  // 로그인
  async login(loginDto: LoginDto) {
    const user = this.usersService.findByUsername(
      loginDto.username,
    );

    if (!user) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
      },
    };
  }
}