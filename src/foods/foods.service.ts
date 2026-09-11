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

      // 사용자가 한 번이라도 만들어본 음식 조회
const completedFoods =
  foods.length === 0
    ? []
    : await this.prisma.userFood.findMany({
        where: {
          userId: BigInt(userId),

          foodId: {
            in: foods.map(
              (food) => food.id,
            ),
          },
        },

        select: {
          foodId: true,
        },

        distinct: ['foodId'],
      });

const completedFoodIdSet =
  new Set(
    completedFoods.map((item) =>
      item.foodId.toString(),
    ),
  );

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

          isCompleted:
          completedFoodIdSet.has(
            food.id.toString(),
          ),

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

    const completedFood =
  await this.prisma.userFood.findFirst({
    where: {
      userId: BigInt(userId),
      foodId: food.id,
    },

    select: {
      id: true,
    },
  });

  const isCompleted =
  completedFood !== null;

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

      isCompleted,

      ingredients,
    };
  }

  async makeFood(
  foodId: number,
  userId: number,
) {
  // 음식 및 레시피 조회
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

  // 필요한 재료 ID
  const ingredientIds =
    food.recipeItems.map(
      (item) => item.ingredientId,
    );

  // 현재 사용자의 재료 보유량 조회
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

        /*
         * 항상 같은 ingredientId 순서로 처리해서
         * 동시 요청 시 충돌 가능성을 줄임
         */
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
           * 필요한 수량 이상 보유한 경우에만 차감
           * 동시 요청으로 수량이 부족해진 경우
           * update count가 0이 됨
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

          if (updated.count !== 1) {
            throw new Error(
              'INSUFFICIENT_INGREDIENTS_CONCURRENT',
            );
          }

          // 재료 소비 기록
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

          /*
           * RARE / LEGENDARY 재료는
           * 만든 음식의 특별 재료로 별도 기록
           */
          if (
            recipeItem.ingredient.rarity ===
              'RARE' ||
            recipeItem.ingredient.rarity ===
              'LEGENDARY'
          ) {
            await tx.userFoodSpecialIngredient.create({
              data: {
                userFoodId:
                  userFood.id,

                ingredientId:
                  recipeItem.ingredientId,

                quantity:
                  recipeItem.requiredQuantity,

                sourcePlaceId:
                  null,
              },
            });
          }
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

                rarity:
                  item.ingredient.rarity,
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

async findHistoryById(
  historyId: number,
  userId: number,
) {
  const userFood =
    await this.prisma.userFood.findFirst({
      where: {
        id: BigInt(historyId),
        userId: BigInt(userId),
      },

      include: {
        food: true,

        specialIngredients: {
  include: {
    ingredient: true,
    sourcePlace: {
      select: {
        id: true,
        name: true,
      },
    },
  },
},
      },
    });

  if (!userFood) {
    return undefined;
  }

  const transactions =
    await this.prisma.ingredientTransaction.findMany({
      where: {
        userId: BigInt(userId),
        userFoodId: userFood.id,
        transactionType: 'FOOD_USE',
      },

      orderBy: {
        id: 'asc',
      },

      select: {
        ingredientId: true,
        quantityChange: true,
      },
    });

  const ingredientIds = [
    ...new Set(
      transactions.map(
        (transaction) =>
          transaction.ingredientId.toString(),
      ),
    ),
  ].map((id) => BigInt(id));

  const ingredients =
    ingredientIds.length === 0
      ? []
      : await this.prisma.ingredient.findMany({
          where: {
            id: {
              in: ingredientIds,
            },
          },

          select: {
            id: true,
            name: true,
            description: true,
            ingredientType: true,
            imageUrl: true,
            illustrationUrl: true,
            rarity: true,
          },
        });

  const ingredientMap =
    new Map(
      ingredients.map(
        (ingredient) => [
          ingredient.id.toString(),
          ingredient,
        ],
      ),
    );

  /*
   * 특별 재료 ID들
   */
  const specialIngredientIdSet =
    new Set(
      userFood.specialIngredients.map(
        (item) =>
          item.ingredientId.toString(),
      ),
    );

  /*
   * 일반 재료
   */
  const normalIngredients =
    transactions
      .filter(
        (transaction) =>
          !specialIngredientIdSet.has(
            transaction.ingredientId.toString(),
          ),
      )
      .map((transaction) => {
        const ingredient =
          ingredientMap.get(
            transaction.ingredientId.toString(),
          );

        if (!ingredient) {
          return null;
        }

        return {
          ingredientId:
            Number(ingredient.id),

          name:
            ingredient.name,

          quantity:
            Math.abs(
              transaction.quantityChange,
            ),

          ingredientType:
            ingredient.ingredientType,

          imageUrl:
            ingredient.imageUrl,

          illustrationUrl:
            ingredient.illustrationUrl,

          rarity:
            ingredient.rarity,
        };
      })
      .filter(
        (ingredient) =>
          ingredient !== null,
      );

  /*
   * 특별 재료
   *
   * 새 DB에서는 여러 개 가능
   */
  const specialIngredients =
    userFood.specialIngredients.map(
      (item) => ({
        ingredientId:
          Number(item.ingredient.id),

        name:
          item.ingredient.name,

        quantity:
          item.quantity,

        imageUrl:
          item.ingredient.imageUrl,

        illustrationUrl:
          item.ingredient.illustrationUrl,

        rarity:
          item.ingredient.rarity,

        obtainedPlace:
          item.sourcePlace
            ? {
                id:
                  Number(
                    item.sourcePlace.id,
                  ),

                name:
                  item.sourcePlace.name,
              }
            : null,
      }),
    );

  return {
    id:
      Number(userFood.id),

    food: {
      id:
        Number(userFood.food.id),

      name:
        userFood.food.name,

      description:
        userFood.food.description,

      imageUrl:
        userFood.food.imageUrl,

      illustrationUrl:
        userFood.illustrationUrl ??
        userFood.food.illustrationUrl,
    },

    madeAt:
      userFood.madeAt,

    specialIngredients,

    normalIngredients,
  };
}

}