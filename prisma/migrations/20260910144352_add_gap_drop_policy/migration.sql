-- ============================================================
-- GAP-BASED INGREDIENT DROP POLICY
-- ============================================================


-- ============================================================
-- 1. Gap percentile
-- ============================================================

ALTER TABLE "gap_score_history"
ADD COLUMN "gap_percentile" DECIMAL(8,6);


-- 각 Gap Score run 내부에서 percentile 계산
-- PERCENT_RANK:
-- lowest  = 0
-- highest = 1
WITH ranked AS (
    SELECT
        id,
        PERCENT_RANK() OVER (
            PARTITION BY run_id
            ORDER BY gap_score
        ) AS percentile_value
    FROM gap_score_history
)
UPDATE gap_score_history g
SET gap_percentile = ranked.percentile_value::DECIMAL(8,6)
FROM ranked
WHERE g.id = ranked.id;


ALTER TABLE "gap_score_history"
ADD CONSTRAINT "chk_gap_percentile"
CHECK (
    gap_percentile IS NULL
    OR (
        gap_percentile >= 0
        AND gap_percentile <= 1
    )
);


-- ============================================================
-- 2. Region -> FOOD_REGION mapping
-- ============================================================

-- ============================================================
-- FOOD_REGION seed
-- 실제 DB에는 이미 존재할 수 있으므로 idempotent하게 입력
-- shadow DB에서도 동일한 상태를 재현하기 위함
-- ============================================================

INSERT INTO regions (
    parent_id,
    region_type,
    name
)
SELECT
    NULL,
    'FOOD_REGION',
    v.name
FROM (
    VALUES
        ('수도권'),
        ('강원'),
        ('충청'),
        ('경상'),
        ('전라'),
        ('제주')
) AS v(name)
WHERE NOT EXISTS (
    SELECT 1
    FROM regions r
    WHERE r.region_type = 'FOOD_REGION'
      AND r.name = v.name
);

CREATE TABLE "region_food_region_mappings" (
    "source_region_id" BIGINT NOT NULL,
    "food_region_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_food_region_mappings_pkey"
        PRIMARY KEY ("source_region_id", "food_region_id")
);


-- 하나의 행정지역은 하나의 FOOD_REGION에만 소속
CREATE UNIQUE INDEX
"region_food_region_mappings_source_region_id_key"
ON "region_food_region_mappings"("source_region_id");


CREATE INDEX
"region_food_region_mappings_food_region_id_idx"
ON "region_food_region_mappings"("food_region_id");


ALTER TABLE "region_food_region_mappings"
ADD CONSTRAINT "region_food_region_mappings_source_region_id_fkey"
FOREIGN KEY ("source_region_id")
REFERENCES "regions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


ALTER TABLE "region_food_region_mappings"
ADD CONSTRAINT "region_food_region_mappings_food_region_id_fkey"
FOREIGN KEY ("food_region_id")
REFERENCES "regions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- 현재 서비스 대상인 서울특별시 -> 수도권
INSERT INTO region_food_region_mappings (
    source_region_id,
    food_region_id
)
SELECT
    source_region.id,
    food_region.id
FROM regions source_region
CROSS JOIN regions food_region
WHERE source_region.region_type = 'PROVINCE'
  AND source_region.name = '서울특별시'
  AND food_region.region_type = 'FOOD_REGION'
  AND food_region.name = '수도권';


-- ============================================================
-- 3. Ingredient drop policies
-- ============================================================

CREATE TABLE "ingredient_drop_policies" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "min_gap_percentile" DECIMAL(8,6),
    "max_gap_percentile" DECIMAL(8,6),
    "common_probability" DECIMAL(6,5) NOT NULL,
    "uncommon_probability" DECIMAL(6,5) NOT NULL,
    "rare_probability" DECIMAL(6,5) NOT NULL,
    "legendary_probability" DECIMAL(6,5) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "ingredient_drop_policies_pkey"
        PRIMARY KEY ("id")
);


CREATE UNIQUE INDEX
"ingredient_drop_policies_code_key"
ON "ingredient_drop_policies"("code");


-- 허용 policy code 제한
ALTER TABLE "ingredient_drop_policies"
ADD CONSTRAINT "chk_ingredient_drop_policy_code"
CHECK (
    code IN (
        'NO_GAP',
        'GAP_LOW',
        'GAP_MID',
        'GAP_HIGH',
        'GAP_TOP'
    )
);


-- 각각의 확률은 0 ~ 1
ALTER TABLE "ingredient_drop_policies"
ADD CONSTRAINT "chk_ingredient_drop_policy_probability_range"
CHECK (
    common_probability BETWEEN 0 AND 1
    AND uncommon_probability BETWEEN 0 AND 1
    AND rare_probability BETWEEN 0 AND 1
    AND legendary_probability BETWEEN 0 AND 1
);


-- 네 rarity 확률 합은 반드시 1
ALTER TABLE "ingredient_drop_policies"
ADD CONSTRAINT "chk_ingredient_drop_policy_probability_sum"
CHECK (
    common_probability
    + uncommon_probability
    + rare_probability
    + legendary_probability
    = 1.00000
);


-- NO_GAP만 percentile 범위가 NULL.
-- Gap 정책은 0 <= min < max <= 1.
ALTER TABLE "ingredient_drop_policies"
ADD CONSTRAINT "chk_ingredient_drop_policy_percentile_range"
CHECK (
    (
        code = 'NO_GAP'
        AND min_gap_percentile IS NULL
        AND max_gap_percentile IS NULL
    )
    OR
    (
        code <> 'NO_GAP'
        AND min_gap_percentile IS NOT NULL
        AND max_gap_percentile IS NOT NULL
        AND min_gap_percentile >= 0
        AND max_gap_percentile <= 1
        AND min_gap_percentile < max_gap_percentile
    )
);


-- ============================================================
-- 4. 확정된 drop probability seed
-- ============================================================

INSERT INTO ingredient_drop_policies (
    code,
    min_gap_percentile,
    max_gap_percentile,
    common_probability,
    uncommon_probability,
    rare_probability,
    legendary_probability,
    is_active
)
VALUES
    (
        'NO_GAP',
        NULL,
        NULL,
        0.80000,
        0.18000,
        0.02000,
        0.00000,
        TRUE
    ),
    (
        'GAP_LOW',
        0.000000,
        0.500000,
        0.70000,
        0.25000,
        0.05000,
        0.00000,
        TRUE
    ),
    (
        'GAP_MID',
        0.500000,
        0.800000,
        0.55000,
        0.30000,
        0.14000,
        0.01000,
        TRUE
    ),
    (
        'GAP_HIGH',
        0.800000,
        0.950000,
        0.35000,
        0.40000,
        0.22000,
        0.03000,
        TRUE
    ),
    (
        'GAP_TOP',
        0.950000,
        1.000000,
        0.20000,
        0.35000,
        0.35000,
        0.10000,
        TRUE
    );


-- ============================================================
-- 5. Migration-time validation
-- ============================================================

DO $$
DECLARE
    null_percentile_count INTEGER;
    invalid_percentile_count INTEGER;
    policy_count INTEGER;
    food_region_count INTEGER;
    mapping_count INTEGER;
    seoul_exists BOOLEAN;
    invalid_food_mapping_count INTEGER;
BEGIN

    -- --------------------------------------------------------
    -- 기존 Gap Score가 존재한다면 모두 percentile이 계산되어야 함
    -- shadow DB처럼 Gap Score가 0건이어도 정상
    -- --------------------------------------------------------
    SELECT COUNT(*)
    INTO null_percentile_count
    FROM gap_score_history
    WHERE gap_percentile IS NULL;

    IF null_percentile_count <> 0 THEN
        RAISE EXCEPTION
            'Migration failed: % existing gap scores have NULL percentile',
            null_percentile_count;
    END IF;


    SELECT COUNT(*)
    INTO invalid_percentile_count
    FROM gap_score_history
    WHERE gap_percentile < 0
       OR gap_percentile > 1;

    IF invalid_percentile_count <> 0 THEN
        RAISE EXCEPTION
            'Migration failed: invalid gap percentile count = %',
            invalid_percentile_count;
    END IF;


    -- --------------------------------------------------------
    -- FOOD_REGION은 migration 자체가 6개를 보장
    -- --------------------------------------------------------
    SELECT COUNT(*)
    INTO food_region_count
    FROM regions
    WHERE region_type = 'FOOD_REGION'
      AND name IN (
          '수도권',
          '강원',
          '충청',
          '경상',
          '전라',
          '제주'
      );

    IF food_region_count <> 6 THEN
        RAISE EXCEPTION
            'Migration failed: expected 6 FOOD_REGION rows, got %',
            food_region_count;
    END IF;


    -- --------------------------------------------------------
    -- Drop policy 5개 확인
    -- --------------------------------------------------------
    SELECT COUNT(*)
    INTO policy_count
    FROM ingredient_drop_policies;

    IF policy_count <> 5 THEN
        RAISE EXCEPTION
            'Migration failed: expected 5 drop policies, got %',
            policy_count;
    END IF;


    -- --------------------------------------------------------
    -- 서울특별시 데이터가 존재하는 DB라면
    -- 반드시 수도권 mapping 1개가 있어야 함.
    --
    -- shadow DB에 서울 seed 자체가 없다면 mapping 0개도 정상.
    -- --------------------------------------------------------
    SELECT EXISTS (
        SELECT 1
        FROM regions
        WHERE region_type = 'PROVINCE'
          AND name = '서울특별시'
    )
    INTO seoul_exists;


    SELECT COUNT(*)
    INTO mapping_count
    FROM region_food_region_mappings m
    JOIN regions sr
      ON sr.id = m.source_region_id
    JOIN regions fr
      ON fr.id = m.food_region_id
    WHERE sr.region_type = 'PROVINCE'
      AND sr.name = '서울특별시'
      AND fr.region_type = 'FOOD_REGION'
      AND fr.name = '수도권';


    IF seoul_exists AND mapping_count <> 1 THEN
        RAISE EXCEPTION
            'Migration failed: Seoul exists but Seoul -> 수도권 mapping count = %',
            mapping_count;
    END IF;


    -- --------------------------------------------------------
    -- 모든 mapping target은 FOOD_REGION이어야 함
    -- --------------------------------------------------------
    SELECT COUNT(*)
    INTO invalid_food_mapping_count
    FROM region_food_region_mappings m
    JOIN regions r
      ON r.id = m.food_region_id
    WHERE r.region_type <> 'FOOD_REGION';

    IF invalid_food_mapping_count <> 0 THEN
        RAISE EXCEPTION
            'Migration failed: invalid FOOD_REGION mapping count = %',
            invalid_food_mapping_count;
    END IF;

END
$$;