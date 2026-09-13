-- Add these statements to the generated migration.sql BEFORE applying the migration.
-- They enforce PostgreSQL-only constraints that are intentionally not represented
-- as ordinary Prisma schema constraints.

-- One active Naver search term per place.
CREATE UNIQUE INDEX "uq_naver_one_active_term_per_place"
ON "naver_search_terms" ("place_id")
WHERE "is_active" = TRUE;

-- One TREND_FIRST_VIEW reward per user x place.
CREATE UNIQUE INDEX "uq_trend_first_view_per_user_place"
ON "ingredient_transactions" ("user_id", "place_id")
WHERE "transaction_type" = 'TREND_FIRST_VIEW';

-- ---------------- CHECK constraints ----------------

ALTER TABLE "raw_small_business_api"
ADD CONSTRAINT "chk_small_business_change_type"
CHECK ("source_change_type" IS NULL OR "source_change_type" IN ('C', 'U'));

ALTER TABLE "raw_naver_datalab_api"
ADD CONSTRAINT "chk_naver_dates"
CHECK ("end_date" >= "start_date");

ALTER TABLE "raw_naver_datalab_api"
ADD CONSTRAINT "chk_naver_time_unit"
CHECK ("time_unit" IN ('date', 'week', 'month'));

ALTER TABLE "regions"
ADD CONSTRAINT "chk_region_type"
CHECK ("region_type" IN ('PROVINCE', 'DISTRICT', 'ADMIN_DONG', 'LEGAL_DONG'));

ALTER TABLE "category_mappings"
ADD CONSTRAINT "chk_mapping_type"
CHECK ("mapping_type" IS NULL OR "mapping_type" IN ('EXACT', 'MANUAL', 'RULE_BASED'));

ALTER TABLE "category_mappings"
ADD CONSTRAINT "chk_mapping_confidence"
CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));

ALTER TABLE "places"
ADD CONSTRAINT "chk_place_lat"
CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90);

ALTER TABLE "places"
ADD CONSTRAINT "chk_place_lon"
CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);

ALTER TABLE "places"
ADD CONSTRAINT "chk_place_status"
CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'CLOSED', 'HIDDEN'));

ALTER TABLE "region_metrics"
ADD CONSTRAINT "chk_region_metric_family"
CHECK ("metric_family" IN ('VISITOR', 'SERVICE_DEMAND', 'CULTURAL_DEMAND', 'STAY_STRENGTH', 'EXPENDITURE_STRENGTH'));

ALTER TABLE "region_metrics"
ADD CONSTRAINT "chk_region_metric_period"
CHECK (
  ("period_date" IS NOT NULL AND "period_month" IS NULL)
  OR
  ("period_date" IS NULL AND "period_month" IS NOT NULL)
);

ALTER TABLE "gap_score_history"
ADD CONSTRAINT "chk_gap_data_stage"
CHECK ("data_stage" IN ('COLD_START', 'HYBRID', 'MATURE'));

ALTER TABLE "gap_score_history"
ADD CONSTRAINT "chk_gap_score"
CHECK ("gap_score" BETWEEN 0 AND 100);

ALTER TABLE "users"
ADD CONSTRAINT "chk_user_role"
CHECK ("role" IN ('USER', 'SYSTEM_ADMIN'));

ALTER TABLE "users"
ADD CONSTRAINT "chk_user_status"
CHECK ("status" IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED', 'DELETED'));

ALTER TABLE "users"
ADD CONSTRAINT "chk_ranking_sort"
CHECK ("ranking_sort_order" IN ('ASC', 'DESC'));

ALTER TABLE "business_accounts"
ADD CONSTRAINT "chk_business_status"
CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'));

ALTER TABLE "place_operating_hours"
ADD CONSTRAINT "chk_operating_day"
CHECK ("day_of_week" BETWEEN 1 AND 7);

ALTER TABLE "place_special_hours"
ADD CONSTRAINT "chk_special_type"
CHECK ("schedule_type" IN ('CLOSED', 'SPECIAL_OPEN'));

ALTER TABLE "place_verification_settings"
ADD CONSTRAINT "chk_verification_control_mode"
CHECK ("control_mode" IN ('AUTO', 'MANUAL'));

ALTER TABLE "place_verification_settings"
ADD CONSTRAINT "chk_verification_hours_mode"
CHECK ("hours_mode" IN ('SAME_AS_OPERATING', 'CUSTOM'));

ALTER TABLE "place_verification_settings"
ADD CONSTRAINT "chk_code_valid_minutes"
CHECK ("code_valid_minutes" > 0);

ALTER TABLE "place_verification_hours"
ADD CONSTRAINT "chk_verification_day"
CHECK ("day_of_week" BETWEEN 1 AND 7);

ALTER TABLE "visit_verifications"
ADD CONSTRAINT "chk_arrival_option"
CHECK ("arrival_option_minutes" IS NULL OR "arrival_option_minutes" IN (10, 30, 60));

ALTER TABLE "visit_verifications"
ADD CONSTRAINT "chk_verification_code"
CHECK ("verification_code" ~ '^[0-9]{6}$');

ALTER TABLE "visit_verifications"
ADD CONSTRAINT "chk_visit_status"
CHECK ("status" IN ('ISSUED', 'VERIFIED', 'EXPIRED', 'FAILED', 'CANCELLED'));

ALTER TABLE "visit_verifications"
ADD CONSTRAINT "chk_visit_expiration"
CHECK ("expires_at" > "issued_at");

ALTER TABLE "ingredients"
ADD CONSTRAINT "chk_ingredient_type"
CHECK ("ingredient_type" IN ('BASIC', 'REGIONAL'));

ALTER TABLE "ingredients"
ADD CONSTRAINT "chk_ingredient_region"
CHECK (
  ("ingredient_type" = 'BASIC' AND "region_id" IS NULL)
  OR
  ("ingredient_type" = 'REGIONAL' AND "region_id" IS NOT NULL)
);

ALTER TABLE "place_ingredient_rewards"
ADD CONSTRAINT "chk_reward_rule"
CHECK ("reward_rule" IN ('FIRST_VERIFIED_VISIT', 'EVERY_VISIT', 'CAMPAIGN'));

ALTER TABLE "place_ingredient_rewards"
ADD CONSTRAINT "chk_reward_quantity"
CHECK ("quantity" > 0);

ALTER TABLE "user_ingredients"
ADD CONSTRAINT "chk_user_ingredient_quantity"
CHECK ("quantity" >= 0);

ALTER TABLE "food_recipe_ingredients"
ADD CONSTRAINT "chk_recipe_quantity"
CHECK ("required_quantity" > 0);

ALTER TABLE "ingredient_transactions"
ADD CONSTRAINT "chk_ingredient_change"
CHECK ("quantity_change" <> 0);

ALTER TABLE "ingredient_transactions"
ADD CONSTRAINT "chk_ingredient_transaction_type"
CHECK ("transaction_type" IN ('VISIT_REWARD', 'TREND_FIRST_VIEW', 'FOOD_USE', 'ADMIN_ADJUSTMENT'));

ALTER TABLE "posts"
ADD CONSTRAINT "chk_post_status"
CHECK ("status" IN ('PUBLISHED', 'HIDDEN', 'DELETED'));

ALTER TABLE "post_images"
ADD CONSTRAINT "chk_post_image_order"
CHECK ("display_order" BETWEEN 1 AND 5);

ALTER TABLE "place_external_contents"
ADD CONSTRAINT "chk_external_content_type"
CHECK ("content_type" IN ('NAVER_BLOG', 'SNS', 'OTHER'));

ALTER TABLE "place_issue_reports"
ADD CONSTRAINT "chk_report_type"
CHECK ("report_type" IN ('UNRELATED_CONTENT', 'BAD_LINK', 'OTHER'));

ALTER TABLE "place_issue_reports"
ADD CONSTRAINT "chk_report_status"
CHECK ("status" IN ('OPEN', 'REVIEWING', 'RESOLVED', 'REJECTED'));

ALTER TABLE "external_sync_runs"
ADD CONSTRAINT "chk_sync_type"
CHECK ("sync_type" IS NULL OR "sync_type" IN ('INITIAL', 'INCREMENTAL', 'PERIODIC'));

ALTER TABLE "external_sync_runs"
ADD CONSTRAINT "chk_sync_status"
CHECK ("status" IN ('RUNNING', 'SUCCESS', 'FAILED'));