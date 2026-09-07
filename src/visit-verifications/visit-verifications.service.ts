import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PlacesService } from '../places/places.service';
import { CreateVisitVerificationDto } from './dto/create-visit-verification.dto';

export type VisitVerificationStatus =
  | 'ISSUED'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'FAILED'
  | 'CANCELLED';

export interface VisitVerification {
  id: number;

  userId: number;
  placeId: number;

  arrivalOptionMinutes: number;
  expectedArrivalAt: Date;

  verificationCode: string;

  issuedAt: Date;
  expiresAt: Date;

  status: VisitVerificationStatus;

  verifiedAt: Date | null;
  failReason: string | null;

  createdAt: Date;
}

@Injectable()
export class VisitVerificationsService {
  private readonly visitVerifications: VisitVerification[] = [];
  private nextId = 1;

  constructor(
    private readonly placesService: PlacesService,
  ) {}

  create(
    userId: number,
    dto: CreateVisitVerificationDto,
  ): VisitVerification {
    const place = this.placesService.findById(dto.placeId);

    if (!place) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    if (!place.verification?.enabled) {
      throw new BadRequestException(
        '현재 방문 인증을 사용할 수 없는 장소입니다.',
      );
    }

    const issuedAt = new Date();

    const expectedArrivalAt = new Date(
      issuedAt.getTime() +
        dto.arrivalOptionMinutes * 60 * 1000,
    );

    const expiresAt = new Date(
      expectedArrivalAt.getTime() +
        place.verification.codeValidMinutes * 60 * 1000,
    );

    const verificationCode = this.generateVerificationCode();

    const visitVerification: VisitVerification = {
      id: this.nextId++,

      userId,
      placeId: dto.placeId,

      arrivalOptionMinutes: dto.arrivalOptionMinutes,
      expectedArrivalAt,

      verificationCode,

      issuedAt,
      expiresAt,

      status: 'ISSUED',

      verifiedAt: null,
      failReason: null,

      createdAt: issuedAt,
    };

    this.visitVerifications.push(visitVerification);

    return visitVerification;
  }


  findById(
  userId: number,
  id: number,
): VisitVerification | undefined {
  const verification = this.visitVerifications.find(
    (verification) =>
      verification.id === id &&
      verification.userId === userId,
  );

  if (!verification) {
    return undefined;
  }

  // 아직 ISSUED 상태인데 만료 시간이 지났다면 EXPIRED 처리
  if (
    verification.status === 'ISSUED' &&
    verification.expiresAt.getTime() < Date.now()
  ) {
    verification.status = 'EXPIRED';
  }

  return verification;
}

  private generateVerificationCode(): string {
    return Math.floor(
      100000 + Math.random() * 900000,
    ).toString();
  }
}