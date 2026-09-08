import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface CategoryResponse {
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  level: number | null;
  isActive: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findAll(): Promise<CategoryResponse[]> {
    const categories =
      await this.prisma.category.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          parentId: true,
          code: true,
          name: true,
          level: true,
          isActive: true,
        },
        orderBy: {
          id: 'asc',
        },
      });

    return categories.map((category) => ({
      id: Number(category.id),

      parentId:
        category.parentId === null
          ? null
          : Number(category.parentId),

      code: category.code,
      name: category.name,
      level: category.level,
      isActive: category.isActive,
    }));
  }
}