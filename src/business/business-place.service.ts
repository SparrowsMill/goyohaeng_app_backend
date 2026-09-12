import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  UpdateBusinessPlaceDto,
} from './dto/update-business-place.dto';

@Injectable()
export class BusinessPlaceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getMyPlace(
    placeId: number,
  ) {
    const place =
      await this.prisma.place.findUnique({
        where: {
          id: BigInt(placeId),
        },

        select: {
          id: true,
          name: true,

          categoryId: true,

          districtRegionId: true,
          adminDongRegionId: true,
          legalDongRegionId: true,

          roadAddress: true,
          lotAddress: true,
          postalCode: true,

          latitude: true,
          longitude: true,

          phone: true,
          homepage: true,
          overview: true,

          status: true,

          createdAt: true,
          updatedAt: true,

          category: {
            select: {
              id: true,
              name: true,
            },
          },

          images: {
            where: {
              isActive: true,
            },

            orderBy: {
              displayOrder: 'asc',
            },

            select: {
              id: true,
              originalUrl: true,
              thumbnailUrl: true,
              displayOrder: true,
            },
          },
        },
      });

    if (!place) {
      throw new NotFoundException(
        '관리 장소를 찾을 수 없습니다.',
      );
    }

    return {
      id: Number(place.id),
      name: place.name,

      categoryId:
        place.categoryId === null
          ? null
          : Number(place.categoryId),

      category:
        place.category === null
          ? null
          : {
              id: Number(place.category.id),
              name: place.category.name,
            },

      districtRegionId:
        place.districtRegionId === null
          ? null
          : Number(
              place.districtRegionId,
            ),

      adminDongRegionId:
        place.adminDongRegionId === null
          ? null
          : Number(
              place.adminDongRegionId,
            ),

      legalDongRegionId:
        place.legalDongRegionId === null
          ? null
          : Number(
              place.legalDongRegionId,
            ),

      roadAddress:
        place.roadAddress,

      lotAddress:
        place.lotAddress,

      postalCode:
        place.postalCode,

      latitude:
        place.latitude === null
          ? null
          : Number(place.latitude),

      longitude:
        place.longitude === null
          ? null
          : Number(place.longitude),

      phone:
        place.phone,

      homepage:
        place.homepage,

      overview:
        place.overview,

      status:
        place.status,

      images:
        place.images.map(
          (image) => ({
            id: Number(image.id),

            originalUrl:
              image.originalUrl,

            thumbnailUrl:
              image.thumbnailUrl,

            displayOrder:
              image.displayOrder,
          }),
        ),

      createdAt:
        place.createdAt,

      updatedAt:
        place.updatedAt,
    };
  }

  async updateMyPlace(
    placeId: number,
    dto: UpdateBusinessPlaceDto,
  ) {
    const existing =
      await this.prisma.place.findUnique({
        where: {
          id: BigInt(placeId),
        },

        select: {
          id: true,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        '관리 장소를 찾을 수 없습니다.',
      );
    }

    const normalizeNullableString = (
      value:
        | string
        | null
        | undefined,
    ) => {
      if (value === undefined) {
        return undefined;
      }

      if (value === null) {
        return null;
      }

      const trimmed =
        value.trim();

      return trimmed.length === 0
        ? null
        : trimmed;
    };

    await this.prisma.place.update({
      where: {
        id: BigInt(placeId),
      },

      data: {
        ...(dto.name !== undefined && {
          name:
            dto.name.trim(),
        }),

        ...(dto.phone !== undefined && {
          phone:
            normalizeNullableString(
              dto.phone,
            ),
        }),

        ...(dto.homepage !==
          undefined && {
          homepage:
            normalizeNullableString(
              dto.homepage,
            ),
        }),

        ...(dto.overview !==
          undefined && {
          overview:
            normalizeNullableString(
              dto.overview,
            ),
        }),

        updatedAt:
          new Date(),
      },
    });

    return this.getMyPlace(
      placeId,
    );
  }
}