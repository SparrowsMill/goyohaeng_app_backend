-- ============================================================
-- FOOD / SPECIAL INGREDIENT STRUCTURE UPDATE
-- ============================================================

-- 1. foods.rarity 추가
-- 기존 foods 데이터가 존재하므로 우선 nullable로 추가한다.
ALTER TABLE "foods"
ADD COLUMN "rarity" VARCHAR(20);

-- 기존 2개 음식은 임시로 COMMON 처리한다.
-- 이후 확정한 39개 음식 seed 단계에서 최종 rarity로 교체한다.
UPDATE "foods"
SET "rarity" = 'COMMON'
WHERE "rarity" IS NULL;

-- Prisma schema와 맞게 NOT NULL로 변경한다.
ALTER TABLE "foods"
ALTER COLUMN "rarity" SET NOT NULL;


-- ============================================================
-- 2. UserFood의 다중 특별재료 저장 테이블 생성
-- ============================================================

CREATE TABLE "user_food_special_ingredients" (
    "user_food_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source_place_id" BIGINT,

    CONSTRAINT "user_food_special_ingredients_pkey"
        PRIMARY KEY ("user_food_id", "ingredient_id")
);


-- ============================================================
-- 3. 기존 UserFood의 단일 특별재료 데이터를 새 테이블로 이전
-- ============================================================

INSERT INTO "user_food_special_ingredients" (
    "user_food_id",
    "ingredient_id",
    "quantity",
    "source_place_id"
)
SELECT
    "id",
    "special_ingredient_id",
    1,
    "special_source_place_id"
FROM "user_foods"
WHERE "special_ingredient_id" IS NOT NULL;


-- ============================================================
-- 4. 새 테이블 FK 설정
-- ============================================================

ALTER TABLE "user_food_special_ingredients"
ADD CONSTRAINT "user_food_special_ingredients_user_food_id_fkey"
FOREIGN KEY ("user_food_id")
REFERENCES "user_foods"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "user_food_special_ingredients"
ADD CONSTRAINT "user_food_special_ingredients_ingredient_id_fkey"
FOREIGN KEY ("ingredient_id")
REFERENCES "ingredients"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "user_food_special_ingredients"
ADD CONSTRAINT "user_food_special_ingredients_source_place_id_fkey"
FOREIGN KEY ("source_place_id")
REFERENCES "places"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;


-- ============================================================
-- 5. 조회용 인덱스
-- ============================================================

CREATE INDEX "user_food_special_ingredients_ingredient_id_idx"
ON "user_food_special_ingredients"("ingredient_id");

CREATE INDEX "user_food_special_ingredients_source_place_id_idx"
ON "user_food_special_ingredients"("source_place_id");


-- ============================================================
-- 6. 기존 UserFood의 단일 특별재료 컬럼 제거
-- 데이터는 위에서 새 테이블로 이전된 상태이다.
-- ============================================================

ALTER TABLE "user_foods"
DROP COLUMN "special_ingredient_id",
DROP COLUMN "special_source_place_id";