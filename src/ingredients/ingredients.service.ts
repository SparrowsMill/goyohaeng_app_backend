import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findById(
    ingredientId: number,
    userId: number,
  ) {
    const ingredient =
      await this.prisma.ingredient.findFirst({
        where: {
          id: BigInt(ingredientId),
          isActive: true,
        },
      });

    if (!ingredient) {
      return undefined;
    }

    const now = new Date();

    const [
      userIngredient,
      recipes,
      placeRewards,
    ] = await Promise.all([
      // 사용자의 현재 보유 수량
      this.prisma.userIngredient.findUnique({
        where: {
          userId_ingredientId: {
            userId: BigInt(userId),
            ingredientId:
              BigInt(ingredientId),
          },
        },
      }),

      // 이 재료가 사용되는 음식
      this.prisma.foodRecipeIngredient.findMany({
        where: {
          ingredientId:
            BigInt(ingredientId),

          food: {
            isActive: true,
          },
        },

        include: {
          food: true,
        },

        orderBy: {
          foodId: 'asc',
        },
      }),

      // 현재 이 재료를 획득할 수 있는 장소
      this.prisma.placeIngredientReward.findMany({
        where: {
          ingredientId:
            BigInt(ingredientId),

          isActive: true,

          place: {
            status: 'ACTIVE',
          },

          AND: [
            {
              OR: [
                {
                  validFrom: null,
                },
                {
                  validFrom: {
                    lte: now,
                  },
                },
              ],
            },

            {
              OR: [
                {
                  validUntil: null,
                },
                {
                  validUntil: {
                    gte: now,
                  },
                },
              ],
            },
          ],
        },

        include: {
          place: true,
        },

        orderBy: {
          placeId: 'asc',
        },
      }),
    ]);

    const quantity =
      userIngredient?.quantity ?? 0;

    return {
      id: Number(ingredient.id),

      name: ingredient.name,

      description:
        ingredient.description,

      ingredientType:
        ingredient.ingredientType,

      quantity,

      obtained:
        quantity > 0,

      imageUrl:
        ingredient.imageUrl,

      illustrationUrl:
        ingredient.illustrationUrl,

      rarity:
        ingredient.rarity,

      regionId:
        ingredient.regionId === null
          ? null
          : Number(ingredient.regionId),

      // 이 재료가 사용되는 음식
      usedFoods:
        recipes.map((recipe) => ({
          foodId:
            Number(recipe.food.id),

          name:
            recipe.food.name,

          description:
            recipe.food.description,

          imageUrl:
            recipe.food.imageUrl,

          illustrationUrl:
            recipe.food.illustrationUrl,

          requiredQuantity:
            recipe.requiredQuantity,
        })),

      // 이 재료를 받을 수 있는 장소
      acquisitionPlaces:
        placeRewards.map(
          (reward) => ({
            placeId:
              Number(reward.place.id),

            placeName:
              reward.place.name,

            quantity:
              reward.quantity,

            rewardRule:
              reward.rewardRule,

            roadAddress:
              reward.place.roadAddress,
          }),
        ),
    };
  }
}