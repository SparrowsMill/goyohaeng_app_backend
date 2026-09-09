import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FoodsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // 음식 목록 조회
  async findAll(userId: number) {
    const foods =
      await this.prisma.food.findMany({
        where: {
          isActive: true,
        },

        orderBy: {
          id: 'asc',
        },

        include: {
          region: true,

          recipeItems: {
            include: {
              ingredient: true,
            },
          },
        },
      });

    // 음식 목록에 필요한 모든 재료 ID
    const ingredientIds = [
      ...new Set(
        foods.flatMap((food) =>
          food.recipeItems.map((item) =>
            item.ingredientId.toString(),
          ),
        ),
      ),
    ].map((id) => BigInt(id));

    // 사용자가 가진 재료 조회
    const userIngredients =
      ingredientIds.length === 0
        ? []
        : await this.prisma.userIngredient.findMany({
            where: {
              userId: BigInt(userId),

              ingredientId: {
                in: ingredientIds,
              },
            },
          });

    // ingredientId -> 보유 수량
    const balanceMap = new Map(
      userIngredients.map((item) => [
        item.ingredientId.toString(),
        item.quantity,
      ]),
    );

    return {
      items: foods.map((food) => {
        const ingredients =
          food.recipeItems.map((item) => {
            const ownedQuantity =
              balanceMap.get(
                item.ingredientId.toString(),
              ) ?? 0;

            return {
              id: Number(item.ingredient.id),
              name: item.ingredient.name,

              ingredientType:
                item.ingredient.ingredientType,

              requiredQuantity:
                item.requiredQuantity,

              ownedQuantity,

              enough:
                ownedQuantity >=
                item.requiredQuantity,

              imageUrl:
                item.ingredient.imageUrl,

              illustrationUrl:
                item.ingredient
                  .illustrationUrl,

              rarity:
                item.ingredient.rarity,
            };
          });

        const canMake =
          ingredients.length > 0 &&
          ingredients.every(
            (ingredient) =>
              ingredient.enough,
          );

        return {
          id: Number(food.id),
          name: food.name,
          description: food.description,

          regionId:
            food.regionId === null
              ? null
              : Number(food.regionId),

          regionName:
            food.region?.name ?? null,

          imageUrl: food.imageUrl,

          illustrationUrl:
            food.illustrationUrl,

          canMake,

          ingredients,
        };
      }),
    };
  }

  // 음식 상세 조회
  async findById(
    foodId: number,
    userId: number,
  ) {
    const food =
      await this.prisma.food.findFirst({
        where: {
          id: BigInt(foodId),
          isActive: true,
        },

        include: {
          region: true,

          recipeItems: {
            include: {
              ingredient: true,
            },
          },
        },
      });

    if (!food) {
      return undefined;
    }

    const ingredientIds =
      food.recipeItems.map(
        (item) => item.ingredientId,
      );

    const userIngredients =
      ingredientIds.length === 0
        ? []
        : await this.prisma.userIngredient.findMany({
            where: {
              userId: BigInt(userId),

              ingredientId: {
                in: ingredientIds,
              },
            },
          });

    const balanceMap = new Map(
      userIngredients.map((item) => [
        item.ingredientId.toString(),
        item.quantity,
      ]),
    );

    const ingredients =
      food.recipeItems.map((item) => {
        const ownedQuantity =
          balanceMap.get(
            item.ingredientId.toString(),
          ) ?? 0;

        return {
          id: Number(item.ingredient.id),

          name: item.ingredient.name,

          description:
            item.ingredient.description,

          ingredientType:
            item.ingredient.ingredientType,

          requiredQuantity:
            item.requiredQuantity,

          ownedQuantity,

          enough:
            ownedQuantity >=
            item.requiredQuantity,

          imageUrl:
            item.ingredient.imageUrl,

          illustrationUrl:
            item.ingredient
              .illustrationUrl,

          rarity:
            item.ingredient.rarity,

          regionId:
            item.ingredient.regionId === null
              ? null
              : Number(
                  item.ingredient.regionId,
                ),
        };
      });

    const canMake =
      ingredients.length > 0 &&
      ingredients.every(
        (ingredient) =>
          ingredient.enough,
      );

    return {
      id: Number(food.id),
      name: food.name,
      description: food.description,

      regionId:
        food.regionId === null
          ? null
          : Number(food.regionId),

      regionName:
        food.region?.name ?? null,

      imageUrl: food.imageUrl,

      illustrationUrl:
        food.illustrationUrl,

      canMake,

      ingredients,
    };
  }

  async makeFood(
  foodId: number,
  userId: number,
) {
  // 먼저 음식과 레시피 확인
  const food =
    await this.prisma.food.findFirst({
      where: {
        id: BigInt(foodId),
        isActive: true,
      },

      include: {
        recipeItems: {
          include: {
            ingredient: true,
          },
        },
      },
    });

  if (!food) {
    return {
      success: false as const,
      reason: 'FOOD_NOT_FOUND' as const,
    };
  }

  if (food.recipeItems.length === 0) {
    return {
      success: false as const,
      reason: 'RECIPE_NOT_FOUND' as const,
    };
  }

  // 현재 사용자 재료 조회
  const ingredientIds =
    food.recipeItems.map(
      (item) => item.ingredientId,
    );

  const userIngredients =
    await this.prisma.userIngredient.findMany({
      where: {
        userId: BigInt(userId),

        ingredientId: {
          in: ingredientIds,
        },
      },
    });

  const balanceMap = new Map(
    userIngredients.map((item) => [
      item.ingredientId.toString(),
      item.quantity,
    ]),
  );

  // 부족한 재료 확인
  const missingIngredients =
    food.recipeItems
      .map((item) => {
        const ownedQuantity =
          balanceMap.get(
            item.ingredientId.toString(),
          ) ?? 0;

        return {
          ingredientId:
            Number(item.ingredientId),

          name:
            item.ingredient.name,

          requiredQuantity:
            item.requiredQuantity,

          ownedQuantity,

          shortage:
            Math.max(
              item.requiredQuantity -
                ownedQuantity,
              0,
            ),
        };
      })
      .filter(
        (item) => item.shortage > 0,
      );

  if (missingIngredients.length > 0) {
    return {
      success: false as const,
      reason:
        'INSUFFICIENT_INGREDIENTS' as const,
      missingIngredients,
    };
  }

  try {
    return await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();

        // 만든 음식 기록 생성
        const userFood =
          await tx.userFood.create({
            data: {
              userId: BigInt(userId),
              foodId: BigInt(foodId),
              madeAt: now,

              illustrationUrl:
                food.illustrationUrl,
            },
          });

        // ingredientId 순으로 처리해서
        // 동시 transaction 충돌 가능성을 줄임
        const sortedRecipeItems = [
          ...food.recipeItems,
        ].sort((a, b) =>
          a.ingredientId <
          b.ingredientId
            ? -1
            : 1,
        );

        for (const recipeItem of
          sortedRecipeItems) {
          /*
           * 필요한 수량 이상 가지고 있을 때만
           * 실제 차감
           *
           * 동시에 요리 요청이 들어오더라도
           * quantity가 음수가 되는 것을 방지한다.
           */
          const updated =
            await tx.userIngredient.updateMany({
              where: {
                userId: BigInt(userId),

                ingredientId:
                  recipeItem.ingredientId,

                quantity: {
                  gte:
                    recipeItem.requiredQuantity,
                },
              },

              data: {
                quantity: {
                  decrement:
                    recipeItem.requiredQuantity,
                },

                updatedAt: now,
              },
            });

          // 앞의 검사 이후 다른 요청이 먼저
          // 재료를 소비한 경우
          if (updated.count !== 1) {
            throw new Error(
              'INSUFFICIENT_INGREDIENTS_CONCURRENT',
            );
          }

          // 재료 사용 이력 기록
          await tx.ingredientTransaction.create({
            data: {
              userId: BigInt(userId),

              ingredientId:
                recipeItem.ingredientId,

              quantityChange:
                -recipeItem.requiredQuantity,

              transactionType:
                'FOOD_USE',

              userFoodId:
                userFood.id,
            },
          });
        }

        return {
          success: true as const,

          userFood: {
            id: Number(userFood.id),

            foodId: Number(food.id),

            name: food.name,

            madeAt:
              userFood.madeAt,

            illustrationUrl:
              userFood.illustrationUrl,
          },

          usedIngredients:
            food.recipeItems.map(
              (item) => ({
                ingredientId:
                  Number(
                    item.ingredientId,
                  ),

                name:
                  item.ingredient.name,

                quantity:
                  item.requiredQuantity,
              }),
            ),
        };
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'INSUFFICIENT_INGREDIENTS_CONCURRENT'
    ) {
      return {
        success: false as const,

        reason:
          'INSUFFICIENT_INGREDIENTS' as const,

        missingIngredients: [],
      };
    }

    throw error;
  }
}
}