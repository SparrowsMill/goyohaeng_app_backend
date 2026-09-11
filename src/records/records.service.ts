import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateRecordDto } from './dto/create-record.dto';

import { UpdateRecordDto } from './dto/update-record.dto';

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private formatSeoulDate(
    date: Date | null,
  ): string | null {
    if (!date) {
      return null;
    }

    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        },
      ).formatToParts(date);

    const year =
      parts.find(
        (part) =>
          part.type === 'year',
      )?.value;

    const month =
      parts.find(
        (part) =>
          part.type === 'month',
      )?.value;

    const day =
      parts.find(
        (part) =>
          part.type === 'day',
      )?.value;

    return `${year}-${month}-${day}`;
  }

  async create(
    userId: number,
    dto: CreateRecordDto,
  ) {
    let placeId =
      dto.placeId !== undefined
        ? BigInt(dto.placeId)
        : null;

    /*
     * 장소가 직접 지정된 경우
     * 실제 ACTIVE 장소인지 확인
     */
    if (placeId !== null) {
      const place =
        await this.prisma.place.findFirst({
          where: {
            id: placeId,
            status: 'ACTIVE',
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
    }

    /*
     * 음식 기록 연결 시
     * 반드시 본인이 만든 음식이어야 함
     */
    if (
      dto.userFoodId !== undefined
    ) {
      const userFood =
        await this.prisma.userFood.findFirst({
          where: {
            id: BigInt(
              dto.userFoodId,
            ),

            userId:
              BigInt(userId),
          },

          select: {
            id: true,
          },
        });

      if (!userFood) {
        throw new BadRequestException(
          '본인이 만든 음식만 기록에 연결할 수 있습니다.',
        );
      }
    }

    /*
     * 방문 인증 기록 연결 시
     * 본인의 VERIFIED 인증만 연결 가능
     */
    if (
      dto.visitVerificationId !==
      undefined
    ) {
      const verification =
        await this.prisma
          .visitVerification
          .findFirst({
            where: {
              id: BigInt(
                dto.visitVerificationId,
              ),

              userId:
                BigInt(userId),

              status:
                'VERIFIED',
            },

            select: {
              id: true,
              placeId: true,
              verifiedAt: true,
            },
          });

      if (!verification) {
        throw new BadRequestException(
          '완료된 본인 방문 인증만 기록에 연결할 수 있습니다.',
        );
      }

      /*
       * placeId를 따로 보내지 않았다면
       * 방문 인증 장소를 자동 사용
       */
      if (placeId === null) {
        placeId =
          verification.placeId;
      }

      /*
       * 둘 다 보냈는데 서로 다른 장소면 오류
       */
      if (
        placeId !== null &&
        placeId !==
          verification.placeId
      ) {
        throw new BadRequestException(
          '장소와 방문 인증의 장소가 일치하지 않습니다.',
        );
      }
    }

    /*
     * date가 있으면 한국 시간 자정 기준 저장
     */
    const visitedAt =
      dto.date !== undefined
        ? new Date(
            `${dto.date}T00:00:00+09:00`,
          )
        : null;

    const post =
      await this.prisma.post.create({
        data: {
          userId:
            BigInt(userId),

          placeId,

          userFoodId:
            dto.userFoodId !==
            undefined
              ? BigInt(
                  dto.userFoodId,
                )
              : null,

          visitVerificationId:
            dto.visitVerificationId !==
            undefined
              ? BigInt(
                  dto.visitVerificationId,
                )
              : null,

          visitedAt,

          title: dto.title,

          body: dto.body,

          status: 'PUBLISHED',

          images:
            dto.imageUrls &&
            dto.imageUrls.length > 0
              ? {
                  create:
                    dto.imageUrls.map(
                      (
                        imageUrl,
                        index,
                      ) => ({
                        imageUrl,

                        displayOrder:
                          index + 1,
                      }),
                    ),
                }
              : undefined,
        },

        include: {
          images: {
            orderBy: {
              displayOrder:
                'asc',
            },
          },

          place: {
            select: {
              id: true,
              name: true,
            },
          },

          userFood: {
            include: {
              food: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

    return {
      recordId: Number(post.id),

      message:
        '발자국이 기록되었습니다.',

      record: {
        id: Number(post.id),

        date:
          this.formatSeoulDate(
            post.visitedAt,
          ),

        place:
          post.place
            ? {
                id: Number(
                  post.place.id,
                ),

                name:
                  post.place.name,
              }
            : null,

        food:
          post.userFood
            ? {
                userFoodId:
                  Number(
                    post.userFood.id,
                  ),

                foodId:
                  Number(
                    post.userFood
                      .food.id,
                  ),

                name:
                  post.userFood
                    .food.name,
              }
            : null,

        title: post.title,

        body: post.body,

        images:
          post.images.map(
            (image) => ({
              id: Number(
                image.id,
              ),

              imageUrl:
                image.imageUrl,

              displayOrder:
                image.displayOrder,
            }),
          ),

        createdAt:
          post.createdAt,
      },
    };
  }

  async findAll(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ) {
    const safePage =
      Math.max(page, 1);

    const safeLimit =
      Math.min(
        Math.max(limit, 1),
        100,
      );

    const skip =
      (safePage - 1) *
      safeLimit;

    const where = {
      userId: BigInt(userId),

      status: 'PUBLISHED',
    };

    const [posts, total] =
      await Promise.all([
        this.prisma.post.findMany({
          where,

          orderBy: [
            {
              visitedAt:
                'desc',
            },
            {
              createdAt:
                'desc',
            },
          ],

          skip,

          take: safeLimit,

          include: {
            images: {
              orderBy: {
                displayOrder:
                  'asc',
              },
            },

            place: {
              select: {
                id: true,
                name: true,
              },
            },

            userFood: {
              include: {
                food: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        }),

        this.prisma.post.count({
          where,
        }),
      ]);

    return {
      records:
        posts.map(
          (post) => ({
            id: Number(post.id),

            date:
              this.formatSeoulDate(
                post.visitedAt,
              ),

            place:
              post.place
                ? {
                    id: Number(
                      post.place.id,
                    ),

                    name:
                      post.place.name,
                  }
                : null,

            food:
              post.userFood
                ? {
                    userFoodId:
                      Number(
                        post
                          .userFood.id,
                      ),

                    foodId:
                      Number(
                        post
                          .userFood
                          .food.id,
                      ),

                    name:
                      post
                        .userFood
                        .food.name,
                  }
                : null,

            title:
              post.title,

            body:
              post.body,

            images:
              post.images.map(
                (image) => ({
                  id: Number(
                    image.id,
                  ),

                  imageUrl:
                    image.imageUrl,

                  displayOrder:
                    image.displayOrder,
                }),
              ),

            createdAt:
              post.createdAt,

            updatedAt:
              post.updatedAt,
          }),
        ),

      page: safePage,

      limit: safeLimit,

      total,

      totalPages:
        Math.ceil(
          total / safeLimit,
        ),
    };
  }

  async findById(
  userId: number,
  recordId: number,
) {
  const post =
    await this.prisma.post.findFirst({
      where: {
        id: BigInt(recordId),
        userId: BigInt(userId),
        status: 'PUBLISHED',
      },

      include: {
        images: {
          orderBy: {
            displayOrder: 'asc',
          },
        },

        place: {
          select: {
            id: true,
            name: true,
          },
        },

        userFood: {
          include: {
            food: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  if (!post) {
    throw new NotFoundException(
      '발자국을 찾을 수 없습니다.',
    );
  }

  return {
    id: Number(post.id),

    date:
      this.formatSeoulDate(
        post.visitedAt,
      ),

    place:
      post.place
        ? {
            id: Number(
              post.place.id,
            ),
            name:
              post.place.name,
          }
        : null,

    food:
      post.userFood
        ? {
            userFoodId:
              Number(
                post.userFood.id,
              ),

            foodId:
              Number(
                post.userFood.food.id,
              ),

            name:
              post.userFood.food.name,
          }
        : null,

    visitVerificationId:
      post.visitVerificationId
        ? Number(
            post.visitVerificationId,
          )
        : null,

    title: post.title,

    body: post.body,

    images:
      post.images.map(
        (image) => ({
          id: Number(image.id),
          imageUrl:
            image.imageUrl,
          displayOrder:
            image.displayOrder,
        }),
      ),

    createdAt:
      post.createdAt,

    updatedAt:
      post.updatedAt,
  };
}

  async getCalendar(
  userId: number,
  year: number,
  month: number,
) {
  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    throw new BadRequestException(
      '올바른 연도와 월을 입력해주세요.',
    );
  }

  /*
   * 한국 시간 기준
   *
   * 예:
   * 2026-09-01 00:00 KST
   * ~
   * 2026-10-01 00:00 KST
   */
  const monthString =
    String(month).padStart(2, '0');

  const nextMonth =
    month === 12
      ? 1
      : month + 1;

  const nextYear =
    month === 12
      ? year + 1
      : year;

  const nextMonthString =
    String(nextMonth).padStart(2, '0');

  const startDate =
    new Date(
      `${year}-${monthString}-01T00:00:00+09:00`,
    );

  const endDate =
    new Date(
      `${nextYear}-${nextMonthString}-01T00:00:00+09:00`,
    );

  const posts =
    await this.prisma.post.findMany({
      where: {
        userId:
          BigInt(userId),

        status:
          'PUBLISHED',

        visitedAt: {
          gte: startDate,
          lt: endDate,
        },
      },

      select: {
        visitedAt: true,
      },

      orderBy: {
        visitedAt: 'asc',
      },
    });

  /*
   * 날짜별 기록 개수 계산
   */
  const countMap =
    new Map<string, number>();

  for (const post of posts) {
    if (!post.visitedAt) {
      continue;
    }

    const date =
      this.formatSeoulDate(
        post.visitedAt,
      );

    if (!date) {
      continue;
    }

    countMap.set(
      date,
      (countMap.get(date) ?? 0) + 1,
    );
  }

  const recordDays =
    Array.from(
      countMap.entries(),
    ).map(
      ([date, recordCount]) => ({
        date,
        recordCount,
      }),
    );

  return {
    year,
    month,
    recordDays,
  };
}

async update(
  userId: number,
  recordId: number,
  dto: UpdateRecordDto,
) {
  const existingPost =
    await this.prisma.post.findFirst({
      where: {
        id: BigInt(recordId),
        userId: BigInt(userId),
        status: 'PUBLISHED',
      },
    });

  if (!existingPost) {
    throw new NotFoundException(
      '발자국을 찾을 수 없습니다.',
    );
  }

  const visitedAt =
    dto.date !== undefined
      ? new Date(
          `${dto.date}T00:00:00+09:00`,
        )
      : existingPost.visitedAt;

  await this.prisma.$transaction(
    async (tx) => {
      // 글 내용 수정
      await tx.post.update({
        where: {
          id: existingPost.id,
        },

        data: {
          visitedAt,

          title:
            dto.title ??
            existingPost.title,

          body:
            dto.body ??
            existingPost.body,

          updatedAt: new Date(),
        },
      });

      /*
       * imageUrls를 보낸 경우에만
       * 기존 사진 목록 교체
       *
       * undefined → 기존 사진 유지
       * []        → 전부 삭제
       * [a,b]     → a,b로 교체
       */
      if (
        dto.imageUrls !==
        undefined
      ) {
        await tx.postImage.deleteMany({
          where: {
            postId:
              existingPost.id,
          },
        });

        if (
          dto.imageUrls.length >
          0
        ) {
          await tx.postImage.createMany({
            data:
              dto.imageUrls.map(
                (
                  imageUrl,
                  index,
                ) => ({
                  postId:
                    existingPost.id,

                  imageUrl,

                  displayOrder:
                    index + 1,
                }),
              ),
          });
        }
      }
    },
  );

  // 수정된 최종 결과 다시 조회
  return this.findById(
    userId,
    recordId,
  );
}

async remove(
  userId: number,
  recordId: number,
) {
  const result =
    await this.prisma.post.updateMany({
      where: {
        id: BigInt(recordId),

        userId:
          BigInt(userId),

        status:
          'PUBLISHED',
      },

      data: {
        status:
          'DELETED',

        updatedAt:
          new Date(),
      },
    });

  /*
   * 없는 기록
   * 다른 사용자의 기록
   * 이미 삭제된 기록
   *
   * 모두 삭제할 수 없는 것으로 처리
   */
  if (result.count === 0) {
    throw new NotFoundException(
      '발자국을 찾을 수 없습니다.',
    );
  }

  return {
    recordId,
    message:
      '발자국이 삭제되었습니다.',
  };
}
}