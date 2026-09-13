import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PrismaService,
} from '../prisma/prisma.service';

import {
  CreateAnalyticsEventDto,
} from './dto/create-analytics-event.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async createEvent(
    userId: number,
    dto: CreateAnalyticsEventDto,
  ) {
    /*
     * 존재하는 활성 장소인지 확인
     */
    const place =
      await this.prisma.place.findFirst({
        where: {
          id:
            BigInt(dto.placeId),

          status:
            'ACTIVE',
        },

        select: {
          id: true,
        },
      });

    if (!place) {
      throw new NotFoundException(
        '장소를 찾을 수 없습니다.',
      );
    }

    /*
     * 사용자 행동 이벤트 저장
     *
     * occurredAt은
     * Prisma schema의 @default(now())를 사용한다.
     */
    const event =
      await this.prisma
        .analyticsEvent
        .create({
          data: {
            userId:
              BigInt(userId),

            placeId:
              BigInt(
                dto.placeId,
              ),

            eventType:
              dto.eventType,
          },

          select: {
            id: true,
            placeId: true,
            eventType: true,
            occurredAt: true,
          },
        });

    return {
      id:
        Number(event.id),

      placeId:
        event.placeId === null
          ? null
          : Number(
              event.placeId,
            ),

      eventType:
        event.eventType,

      occurredAt:
        event.occurredAt,
    };
  }
}