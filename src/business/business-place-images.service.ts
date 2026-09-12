import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateBusinessPlaceImageDto,
} from './dto/create-business-place-image.dto';

import {
  UpdateBusinessPlaceImageDto,
} from './dto/update-business-place-image.dto';

@Injectable()
export class BusinessPlaceImagesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();

    return trimmed.length === 0
      ? null
      : trimmed;
  }

  private serialize(
    image: {
      id: bigint;
      placeId: bigint;
      uploadedByUserId: bigint | null;
      imageName: string | null;
      originalUrl: string;
      thumbnailUrl: string | null;
      displayOrder: number | null;
      isActive: boolean;
      createdAt: Date;
    },
  ) {
    return {
      id: Number(image.id),
      placeId: Number(image.placeId),

      uploadedByUserId:
        image.uploadedByUserId === null
          ? null
          : Number(
              image.uploadedByUserId,
            ),

      imageName:
        image.imageName,

      originalUrl:
        image.originalUrl,

      thumbnailUrl:
        image.thumbnailUrl,

      displayOrder:
        image.displayOrder,

      isActive:
        image.isActive,

      createdAt:
        image.createdAt,
    };
  }

  async findAll(
    placeId: number,
  ) {
    const images =
      await this.prisma.placeImage.findMany({
        where: {
          placeId:
            BigInt(placeId),
        },

        orderBy: [
          {
            isActive: 'desc',
          },
          {
            displayOrder: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
      });

    return {
      placeId,

      items:
        images.map(
          (image) =>
            this.serialize(
              image,
            ),
        ),
    };
  }

  async create(
    placeId: number,
    userId: number,
    dto:
      CreateBusinessPlaceImageDto,
  ) {
    let displayOrder =
      dto.displayOrder;

    if (
      displayOrder === undefined
    ) {
      const lastImage =
        await this.prisma.placeImage.findFirst({
          where: {
            placeId:
              BigInt(placeId),

            isActive:
              true,
          },

          orderBy: {
            displayOrder:
              'desc',
          },

          select: {
            displayOrder:
              true,
          },
        });

      displayOrder =
        (
          lastImage
            ?.displayOrder ??
          -1
        ) + 1;
    }

    const image =
      await this.prisma.placeImage.create({
        data: {
          placeId:
            BigInt(placeId),

          uploadedByUserId:
            BigInt(userId),

          imageName:
            this.normalizeNullableString(
              dto.imageName,
            ) ?? null,

          originalUrl:
            dto.originalUrl.trim(),

          thumbnailUrl:
            this.normalizeNullableString(
              dto.thumbnailUrl,
            ) ?? null,

          displayOrder,

          isActive:
            true,
        },
      });

    return this.serialize(
      image,
    );
  }

  async update(
    placeId: number,
    imageId: number,
    dto:
      UpdateBusinessPlaceImageDto,
  ) {
    const existing =
      await this.prisma.placeImage.findFirst({
        where: {
          id:
            BigInt(imageId),

          placeId:
            BigInt(placeId),
        },
      });

    if (!existing) {
      throw new NotFoundException(
        '장소 이미지를 찾을 수 없습니다.',
      );
    }

    const image =
      await this.prisma.placeImage.update({
        where: {
          id:
            BigInt(imageId),
        },

        data: {
          ...(dto.originalUrl !==
            undefined && {
            originalUrl:
              dto.originalUrl.trim(),
          }),

          ...(dto.thumbnailUrl !==
            undefined && {
            thumbnailUrl:
              this.normalizeNullableString(
                dto.thumbnailUrl,
              ),
          }),

          ...(dto.imageName !==
            undefined && {
            imageName:
              this.normalizeNullableString(
                dto.imageName,
              ),
          }),

          ...(dto.displayOrder !==
            undefined && {
            displayOrder:
              dto.displayOrder,
          }),
        },
      });

    return this.serialize(
      image,
    );
  }

  async remove(
    placeId: number,
    imageId: number,
  ) {
    const result =
      await this.prisma.placeImage.updateMany({
        where: {
          id:
            BigInt(imageId),

          placeId:
            BigInt(placeId),

          isActive:
            true,
        },

        data: {
          isActive:
            false,
        },
      });

    if (
      result.count === 0
    ) {
      throw new NotFoundException(
        '활성 장소 이미지를 찾을 수 없습니다.',
      );
    }

    return {
      id: imageId,
      deleted: true,
    };
  }
}