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
  /*
   * 등록 장소
   *
   * undefined / null -> 일단 장소 없음
   * number           -> 등록 장소 연결
   */
  let placeId: bigint | null =
    dto.placeId !== undefined &&
    dto.placeId !== null
      ? BigInt(dto.placeId)
      : null;

  /*
   * 수동 장소명
   *
   * 앞뒤 공백 제거
   * 빈 문자열 / 공백만 있는 문자열 -> null
   */
  const trimmedManualPlaceName =
    dto.manualPlaceName === undefined ||
    dto.manualPlaceName === null
      ? null
      : dto.manualPlaceName.trim();

  const manualPlaceName =
    trimmedManualPlaceName &&
    trimmedManualPlaceName.length > 0
      ? trimmedManualPlaceName
      : null;

  /*
   * trim 후 최대 100자
   */
  if (
    manualPlaceName !== null &&
    manualPlaceName.length > 100
  ) {
    throw new BadRequestException(
      '수동 장소명은 최대 100자까지 입력할 수 있습니다.',
    );
  }

  /*
   * 등록 장소와 수동 장소명은
   * 동시에 사용할 수 없음
   */
  if (
    placeId !== null &&
    manualPlaceName !== null
  ) {
    throw new BadRequestException(
      '등록 장소와 수동 장소명은 동시에 설정할 수 없습니다.',
    );
  }

  /*
   * 수동 장소명은 방문 인증 장소가 아니므로
   * 방문 인증과 동시에 연결할 수 없음
   */
  if (
    manualPlaceName !== null &&
    dto.visitVerificationId !== undefined
  ) {
    throw new BadRequestException(
      '수동 장소명을 사용하는 기록에는 방문 인증을 연결할 수 없습니다.',
    );
  }

  /*
   * 등록 장소가 직접 지정된 경우
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
     * placeId를 따로 지정하지 않았다면
     * 방문 인증의 등록 장소를 자동 연결
     */
    if (placeId === null) {
      placeId =
        verification.placeId;
    }

    /*
     * placeId와 방문 인증을
     * 둘 다 지정했는데 장소가 다르면 오류
     */
    if (
      placeId !==
      verification.placeId
    ) {
      throw new BadRequestException(
        '장소와 방문 인증의 장소가 일치하지 않습니다.',
      );
    }
  }

  /*
   * 최종적으로도
   * 등록 장소와 수동 장소명이 동시에
   * 존재하지 않는지 한 번 더 검증
   */
  if (
    placeId !== null &&
    manualPlaceName !== null
  ) {
    throw new BadRequestException(
      '등록 장소와 수동 장소명은 동시에 설정할 수 없습니다.',
    );
  }

  /*
   * date가 있으면
   * 한국 시간 자정 기준 저장
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

        /*
         * 등록 장소
         */
        placeId,

        /*
         * 직접 입력한 장소명
         */
        manualPlaceName,

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

        title:
          dto.title,

        body:
          dto.body,

        status:
          'PUBLISHED',

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
    recordId:
      Number(post.id),

    message:
      '발자국이 기록되었습니다.',

    record: {
      id:
        Number(post.id),

      date:
        this.formatSeoulDate(
          post.visitedAt,
        ),

      /*
       * 등록 장소
       *
       * 수동 장소 기록이면 null
       */
      place:
        post.place
          ? {
              id:
                Number(
                  post.place.id,
                ),

              name:
                post.place.name,
            }
          : null,

      /*
       * 수동 입력 장소명
       *
       * 등록 장소 기록이면 null
       */
      manualPlaceName:
        post.manualPlaceName,

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

      title:
        post.title,

      body:
        post.body,

      images:
        post.images.map(
          (image) => ({
            id:
              Number(
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
    userId:
      BigInt(userId),

    status:
      'PUBLISHED',
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

        take:
          safeLimit,

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
          id:
            Number(post.id),

          date:
            this.formatSeoulDate(
              post.visitedAt,
            ),

          /*
           * 등록 장소
           *
           * 수동 장소 기록이면 null
           */
          place:
            post.place
              ? {
                  id:
                    Number(
                      post.place.id,
                    ),

                  name:
                    post.place.name,
                }
              : null,

          /*
           * 직접 입력한 장소명
           *
           * 등록 장소 기록이면 null
           */
          manualPlaceName:
            post.manualPlaceName,

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
                id:
                  Number(
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

    page:
      safePage,

    limit:
      safeLimit,

    total,

    totalPages:
      Math.ceil(
        total /
          safeLimit,
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
        id:
          BigInt(recordId),

        userId:
          BigInt(userId),

        status:
          'PUBLISHED',
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

  if (!post) {
    throw new NotFoundException(
      '발자국을 찾을 수 없습니다.',
    );
  }

  return {
    id:
      Number(post.id),

    date:
      this.formatSeoulDate(
        post.visitedAt,
      ),

    /*
     * 등록 장소
     */
    place:
      post.place
        ? {
            id:
              Number(
                post.place.id,
              ),

            name:
              post.place.name,
          }
        : null,

    /*
     * 직접 입력한 장소명
     */
    manualPlaceName:
      post.manualPlaceName,

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

    visitVerificationId:
      post.visitVerificationId
        ? Number(
            post.visitVerificationId,
          )
        : null,

    title:
      post.title,

    body:
      post.body,

    images:
      post.images.map(
        (image) => ({
          id:
            Number(
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

  /*
   * =========================================================
   * 변경 후 최종 placeId 계산
   * =========================================================
   *
   * undefined = 기존 값 유지
   * null      = 연결 해제
   * number    = 해당 장소로 변경
   */
  const nextPlaceId =
    dto.placeId === undefined
      ? existingPost.placeId
      : dto.placeId === null
        ? null
        : BigInt(dto.placeId);

  /*
   * =========================================================
   * 변경 후 최종 manualPlaceName 계산
   * =========================================================
   *
   * undefined = 기존 값 유지
   * null      = 수동 장소명 해제
   * string    = trim 후 저장
   *
   * 공백만 입력한 경우 null 처리
   */
  let nextManualPlaceName:
    string | null;

  if (
    dto.manualPlaceName ===
    undefined
  ) {
    nextManualPlaceName =
      existingPost.manualPlaceName;
  } else if (
    dto.manualPlaceName === null
  ) {
    nextManualPlaceName =
      null;
  } else {
    const trimmed =
      dto.manualPlaceName.trim();

    nextManualPlaceName =
      trimmed.length === 0
        ? null
        : trimmed;
  }

  /*
   * trim 후 최대 100자
   */
  if (
    nextManualPlaceName !== null &&
    nextManualPlaceName.length > 100
  ) {
    throw new BadRequestException(
      '수동 장소명은 최대 100자까지 입력할 수 있습니다.',
    );
  }

  /*
   * =========================================================
   * placeId와 manualPlaceName 상호 배타 검증
   * =========================================================
   *
   * PATCH에서는 기존 값 + 새 값을 합친
   * "최종 상태"를 기준으로 검증해야 한다.
   */
  if (
    nextPlaceId !== null &&
    nextManualPlaceName !== null
  ) {
    throw new BadRequestException(
      '등록 장소와 수동 장소명은 동시에 설정할 수 없습니다.',
    );
  }

  /*
   * 새 등록 장소가 지정된 경우
   * 실제 ACTIVE 장소인지 확인
   */
  if (
    dto.placeId !== undefined &&
    dto.placeId !== null
  ) {
    const place =
      await this.prisma.place.findFirst({
        where: {
          id: nextPlaceId!,
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
   * =========================================================
   * 장소가 실제로 변경되었는지 확인
   * =========================================================
   *
   * 등록 장소 변경/해제뿐 아니라
   * 수동 장소명 변경도 장소 변경으로 본다.
   */
  const placeChanged =
    nextPlaceId !==
      existingPost.placeId ||
    nextManualPlaceName !==
      existingPost.manualPlaceName;

  /*
   * 기존 방문 인증이 연결되어 있는데
   * 장소를 변경/해제하면
   * Post의 인증 연결만 해제한다.
   *
   * VisitVerification 자체는 삭제/수정하지 않는다.
   */
  const nextVisitVerificationId =
    placeChanged
      ? null
      : existingPost
          .visitVerificationId;

  /*
   * 날짜 변경
   *
   * undefined = 기존 날짜 유지
   */
  const visitedAt =
    dto.date !== undefined
      ? new Date(
          `${dto.date}T00:00:00+09:00`,
        )
      : existingPost.visitedAt;

  await this.prisma.$transaction(
    async (tx) => {
      /*
       * 글 내용 + 장소를
       * 한 번에 수정
       */
      await tx.post.update({
        where: {
          id: existingPost.id,
        },

        data: {
          visitedAt,

          placeId:
            nextPlaceId,

          manualPlaceName:
            nextManualPlaceName,

          visitVerificationId:
            nextVisitVerificationId,

          title:
            dto.title !== undefined
              ? dto.title
              : existingPost.title,

          body:
            dto.body !== undefined
              ? dto.body
              : existingPost.body,

          updatedAt:
            new Date(),
        },
      });

      /*
       * imageUrls를 보낸 경우에만
       * 기존 사진 목록 교체
       *
       * undefined = 기존 사진 유지
       * []        = 전부 삭제
       * [a,b]     = a,b로 교체
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

  /*
   * 수정 완료 후
   * 최신 데이터 다시 조회
   */
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