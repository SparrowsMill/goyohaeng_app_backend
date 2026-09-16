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

        include: {
          region: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    if (!ingredient) {
      return undefined;
    }

    const [
      userIngredient,
      recipes,
      dropPolicies,
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

      // 현재 방문 보상에 사용되는 GAP 드랍 정책
      this.prisma.ingredientDropPolicy.findMany({
        where: {
          isActive: true,
        },

        orderBy: {
          id: 'asc',
        },
      }),
    ]);

    const quantity =
      userIngredient?.quantity ?? 0;

    /*
     * 이 재료의 희귀도에 해당하는 확률만 추출
     *
     * 실제 방문 보상은
     * 장소의 GAP percentile
     * → drop policy 선택
     * → rarity 추첨
     * → 해당 rarity 재료 중 랜덤 선택
     * 순서로 동작한다.
     */
    const dropProbabilities =
      dropPolicies.map((policy) => {
        let probability = 0;

        switch (ingredient.rarity) {
          case 'COMMON':
            probability =
              Number(
                policy.commonProbability,
              );
            break;

          case 'UNCOMMON':
            probability =
              Number(
                policy.uncommonProbability,
              );
            break;

          case 'RARE':
            probability =
              Number(
                policy.rareProbability,
              );
            break;

          case 'LEGENDARY':
            probability =
              Number(
                policy.legendaryProbability,
              );
            break;

          default:
            probability = 0;
        }

        return {
          policyCode:
            policy.code,

          minGapPercentile:
            policy.minGapPercentile === null
              ? null
              : Number(
                  policy.minGapPercentile,
                ),

          maxGapPercentile:
            policy.maxGapPercentile === null
              ? null
              : Number(
                  policy.maxGapPercentile,
                ),

          probability,
        };
      });

    const isLegendary =
      ingredient.rarity ===
      'LEGENDARY';

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
          : Number(
              ingredient.regionId,
            ),

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

      /*
       * 기존 place_ingredient_rewards 기반
       * 고정 획득처는 더 이상 일반 방문 보상에서
       * 사용하지 않는다.
       *
       * 프론트 호환성을 위해 빈 배열 유지.
       */
      acquisitionPlaces: [],

      // 현재 실제 방문 보상 방식
      acquisition: {
        type: 'VISIT_REWARD',

        method:
          'GAP_BASED_RANDOM_DROP',

        description: isLegendary
  ? '재료는 방문인증 or 트렌드 요약 확인 후 획득 가능하며, 해당 지역의 전설 재료 후보 중에서 추첨됩니다.'
  : '재료는 방문인증 or 트렌드 요약 확인 후 획득 가능하며, 장소의 고요지수에 따라 획득 재료 종류가 달라집니다.',

        region:
          isLegendary &&
          ingredient.region
            ? {
                id: Number(
                  ingredient.region.id,
                ),
                name:
                  ingredient.region.name,
              }
            : null,

        dropProbabilities,
      },
    };
  }
}