import { Injectable } from '@nestjs/common';

export interface Category {
  id: number;
  parentId: number | null;
  code: string;
  name: string;
  level: number;
  isActive: boolean;
}

@Injectable()
export class CategoriesService {
  private readonly categories: Category[] = [
    {
      id: 1,
      parentId: null,
      code: 'FOOD',
      name: '식당',
      level: 1,
      isActive: true,
    },
    {
      id: 2,
      parentId: null,
      code: 'CAFE',
      name: '카페',
      level: 1,
      isActive: true,
    },
    {
      id: 3,
      parentId: null,
      code: 'ACTIVITY',
      name: '액티비티',
      level: 1,
      isActive: true,
    },
  ];

  findAll(): Category[] {
    return this.categories.filter(
      (category) => category.isActive,
    );
  }
}