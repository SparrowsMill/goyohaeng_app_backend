import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateBusinessBenefitDto,
} from './dto/create-business-benefit.dto';

import {
  UpdateBusinessBenefitDto,
} from './dto/update-business-benefit.dto';

@Injectable()
export class BusinessBenefitsService {
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

  private toDate(
    value: string | null | undefined,
  ): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return new Date(value);
  }

  private validatePeriod(
    validFrom: Date | null,
    validUntil: Date | null,
  ) {
    if (
      validFrom &&
      validUntil &&
      validFrom.getTime() >
        validUntil.getTime()
    ) {
      throw new BadRequestException(
        '혜택 종료일은 시작일보다 빠를 수 없습니다.',
      );
    }
  }

  private serializeBenefit(
    benefit: {
      id: bigint;
      placeId: bigint;
      title: string;
      description: string | null;
      validFrom: Date | null;
      validUntil: Date | null;
      isActive: boolean;
      createdByUserId: bigint | null;
      createdAt: Date;
      updatedAt: Date | null;
    },
  ) {
    return {
      id: Number(benefit.id),
      placeId: Number(benefit.placeId),

      title: benefit.title,
      description: benefit.description,

      validFrom: benefit.validFrom,
      validUntil: benefit.validUntil,

      isActive: benefit.isActive,

      createdByUserId:
        benefit.createdByUserId === null
          ? null
          : Number(
              benefit.createdByUserId,
            ),

      createdAt: benefit.createdAt,
      updatedAt: benefit.updatedAt,
    };
  }

  async findAll(
    placeId: number,
  ) {
    const benefits =
      await this.prisma.placeBenefit.findMany({
        where: {
          placeId: BigInt(placeId),
        },

        orderBy: [
          {
            isActive: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
      });

    return {
      placeId,

      items: benefits.map(
        (benefit) =>
          this.serializeBenefit(
            benefit,
          ),
      ),
    };
  }

  async findById(
    placeId: number,
    benefitId: number,
  ) {
    const benefit =
      await this.prisma.placeBenefit.findFirst({
        where: {
          id: BigInt(benefitId),
          placeId: BigInt(placeId),
        },
      });

    if (!benefit) {
      throw new NotFoundException(
        '혜택을 찾을 수 없습니다.',
      );
    }

    return this.serializeBenefit(
      benefit,
    );
  }

  async create(
    placeId: number,
    userId: number,
    dto: CreateBusinessBenefitDto,
  ) {
    const validFrom =
      this.toDate(dto.validFrom) ??
      null;

    const validUntil =
      this.toDate(dto.validUntil) ??
      null;

    this.validatePeriod(
      validFrom,
      validUntil,
    );

    const now = new Date();

    const benefit =
      await this.prisma.placeBenefit.create({
        data: {
          placeId:
            BigInt(placeId),

          title:
            dto.title.trim(),

          description:
            this.normalizeNullableString(
              dto.description,
            ) ?? null,

          validFrom,
          validUntil,

          isActive:
            dto.isActive ?? true,

          createdByUserId:
            BigInt(userId),

          createdAt: now,
          updatedAt: now,
        },
      });

    return this.serializeBenefit(
      benefit,
    );
  }

  async update(
    placeId: number,
    benefitId: number,
    dto: UpdateBusinessBenefitDto,
  ) {
    const existing =
      await this.prisma.placeBenefit.findFirst({
        where: {
          id: BigInt(benefitId),
          placeId: BigInt(placeId),
        },
      });

    if (!existing) {
      throw new NotFoundException(
        '혜택을 찾을 수 없습니다.',
      );
    }

    const validFrom =
      dto.validFrom === undefined
        ? existing.validFrom
        : (
            this.toDate(
              dto.validFrom,
            ) ?? null
          );

    const validUntil =
      dto.validUntil === undefined
        ? existing.validUntil
        : (
            this.toDate(
              dto.validUntil,
            ) ?? null
          );

    this.validatePeriod(
      validFrom,
      validUntil,
    );

    const benefit =
      await this.prisma.placeBenefit.update({
        where: {
          id: BigInt(benefitId),
        },

        data: {
          ...(dto.title !== undefined && {
            title:
              dto.title.trim(),
          }),

          ...(dto.description !==
            undefined && {
            description:
              this.normalizeNullableString(
                dto.description,
              ),
          }),

          ...(dto.validFrom !==
            undefined && {
            validFrom,
          }),

          ...(dto.validUntil !==
            undefined && {
            validUntil,
          }),

          ...(dto.isActive !==
            undefined && {
            isActive:
              dto.isActive,
          }),

          updatedAt:
            new Date(),
        },
      });

    return this.serializeBenefit(
      benefit,
    );
  }

  async remove(
    placeId: number,
    benefitId: number,
  ) {
    const result =
      await this.prisma.placeBenefit.updateMany({
        where: {
          id: BigInt(benefitId),
          placeId: BigInt(placeId),
        },

        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });

    if (result.count === 0) {
      throw new NotFoundException(
        '혜택을 찾을 수 없습니다.',
      );
    }

    return {
      id: benefitId,
      deleted: true,
    };
  }
}