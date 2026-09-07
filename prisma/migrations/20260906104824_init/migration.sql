-- CreateTable
CREATE TABLE "external_sources" (
    "id" BIGSERIAL NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "base_url" TEXT,
    "refresh_cycle" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_tour_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "content_id" VARCHAR(100),
    "content_type_id" VARCHAR(30),
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "source_modified_at" TIMESTAMPTZ(6),
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_tour_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_small_business_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "business_id" VARCHAR(100),
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "source_change_type" VARCHAR(10),
    "source_change_date" DATE,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_small_business_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_region_visitor_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "area_code" VARCHAR(50),
    "signgu_code" VARCHAR(50),
    "base_date" DATE,
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_region_visitor_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_tourism_resource_demand_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "area_code" VARCHAR(50),
    "signgu_code" VARCHAR(50),
    "base_month" CHAR(6),
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_tourism_resource_demand_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_tourism_demand_strength_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "area_code" VARCHAR(50),
    "signgu_code" VARCHAR(50),
    "base_month" CHAR(6),
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_tourism_demand_strength_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_concentration_forecast_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "area_code" VARCHAR(50),
    "signgu_code" VARCHAR(50),
    "attraction_name" VARCHAR(300),
    "request_payload" JSONB,
    "response_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_concentration_forecast_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_naver_datalab_api" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "time_unit" VARCHAR(10) NOT NULL,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_naver_datalab_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" BIGSERIAL NOT NULL,
    "parent_id" BIGINT,
    "region_type" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_external_codes" (
    "id" BIGSERIAL NOT NULL,
    "region_id" BIGINT NOT NULL,
    "source_id" BIGINT NOT NULL,
    "code_type" VARCHAR(80) NOT NULL,
    "external_code" VARCHAR(100) NOT NULL,
    "external_name" VARCHAR(150),
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_external_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "parent_id" BIGINT,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "level" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_mappings" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "scheme" VARCHAR(80) NOT NULL,
    "external_level" INTEGER,
    "external_code" VARCHAR(100) NOT NULL,
    "external_name" VARCHAR(200) NOT NULL,
    "category_id" BIGINT NOT NULL,
    "mapping_type" VARCHAR(20),
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "category_id" BIGINT,
    "district_region_id" BIGINT,
    "admin_dong_region_id" BIGINT,
    "legal_dong_region_id" BIGINT,
    "road_address" VARCHAR(500),
    "lot_address" VARCHAR(500),
    "postal_code" VARCHAR(20),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "phone" VARCHAR(100),
    "homepage" TEXT,
    "owner_intro" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_external_ids" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "source_id" BIGINT NOT NULL,
    "id_type" VARCHAR(50) NOT NULL,
    "external_id" VARCHAR(150) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region_metrics" (
    "id" BIGSERIAL NOT NULL,
    "region_id" BIGINT NOT NULL,
    "source_id" BIGINT NOT NULL,
    "metric_family" VARCHAR(50) NOT NULL,
    "metric_code" VARCHAR(50) NOT NULL,
    "metric_name" VARCHAR(200),
    "day_of_week_code" VARCHAR(20),
    "day_of_week_name" VARCHAR(50),
    "visitor_type_code" VARCHAR(20),
    "visitor_type_name" VARCHAR(100),
    "period_date" DATE,
    "period_month" CHAR(6),
    "metric_value" DECIMAL(20,6) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naver_search_terms" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "search_term" VARCHAR(300) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "naver_search_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naver_search_interest" (
    "id" BIGSERIAL NOT NULL,
    "raw_naver_datalab_id" BIGINT NOT NULL,
    "naver_search_term_id" BIGINT NOT NULL,
    "period_start" DATE NOT NULL,
    "ratio" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "naver_search_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_score_history" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL,
    "formula_version" VARCHAR(50) NOT NULL,
    "data_stage" VARCHAR(20) NOT NULL,
    "comparison_region_id" BIGINT,
    "comparison_category_id" BIGINT,
    "naver_percentile" DECIMAL(8,6),
    "sns_percentile" DECIMAL(8,6),
    "navigation_percentile" DECIMAL(8,6),
    "visitor_percentile" DECIMAL(8,6),
    "expenditure_percentile" DECIMAL(8,6),
    "nonlocal_visitor_percentile" DECIMAL(8,6),
    "online_score" DECIMAL(8,6),
    "offline_score" DECIMAL(8,6),
    "gap_score" DECIMAL(8,4) NOT NULL,
    "explanation_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gap_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "real_name" VARCHAR(100),
    "birth_date" DATE,
    "gender" VARCHAR(30),
    "role" VARCHAR(30) NOT NULL DEFAULT 'USER',
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "promotion_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "nearby_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "record_notification_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ranking_category_filter" VARCHAR(20) NOT NULL DEFAULT 'ALL',
    "ranking_sort_order" VARCHAR(10) NOT NULL DEFAULT 'DESC',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_social_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "platform" VARCHAR(50) NOT NULL,
    "social_user_id" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_images" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "source_id" BIGINT,
    "uploaded_by_user_id" BIGINT,
    "image_name" VARCHAR(300),
    "original_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "copyright_type" VARCHAR(50),
    "serial_no" VARCHAR(100),
    "display_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "place_id" BIGINT NOT NULL,
    "business_name" VARCHAR(300) NOT NULL,
    "business_registration_no" VARCHAR(100) NOT NULL,
    "submitted_store_address" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_user_id" BIGINT,
    "reviewed_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_operating_hours" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "open_time" TIME(6),
    "close_time" TIME(6),
    "break_start_time" TIME(6),
    "break_end_time" TIME(6),
    "updated_by_user_id" BIGINT,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_special_hours" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "target_date" DATE NOT NULL,
    "schedule_type" VARCHAR(20) NOT NULL,
    "open_time" TIME(6),
    "close_time" TIME(6),
    "break_start_time" TIME(6),
    "break_end_time" TIME(6),
    "reason" VARCHAR(500),
    "updated_by_user_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_special_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_benefits" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_verification_settings" (
    "place_id" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "control_mode" VARCHAR(20) NOT NULL DEFAULT 'AUTO',
    "hours_mode" VARCHAR(30) NOT NULL DEFAULT 'SAME_AS_OPERATING',
    "manual_available" BOOLEAN,
    "code_valid_minutes" INTEGER NOT NULL DEFAULT 30,
    "updated_by_user_id" BIGINT,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_verification_settings_pkey" PRIMARY KEY ("place_id")
);

-- CreateTable
CREATE TABLE "place_verification_hours" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "start_time" TIME(6),
    "end_time" TIME(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_verification_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_verifications" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "place_id" BIGINT NOT NULL,
    "arrival_option_minutes" INTEGER,
    "expected_arrival_at" TIMESTAMPTZ(6),
    "verification_code" CHAR(6) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
    "verified_at" TIMESTAMPTZ(6),
    "fail_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "ingredient_type" VARCHAR(20) NOT NULL,
    "region_id" BIGINT,
    "image_url" TEXT,
    "illustration_url" TEXT,
    "rarity" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_ingredient_rewards" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "reward_rule" VARCHAR(40) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "place_ingredient_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ingredients" (
    "user_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "first_acquired_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_ingredients_pkey" PRIMARY KEY ("user_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "region_id" BIGINT,
    "image_url" TEXT,
    "illustration_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_recipe_ingredients" (
    "food_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "required_quantity" INTEGER NOT NULL,

    CONSTRAINT "food_recipe_ingredients_pkey" PRIMARY KEY ("food_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "user_foods" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "food_id" BIGINT NOT NULL,
    "made_at" TIMESTAMPTZ(6) NOT NULL,
    "special_ingredient_id" BIGINT,
    "special_source_place_id" BIGINT,
    "illustration_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_transactions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "ingredient_id" BIGINT NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "transaction_type" VARCHAR(40) NOT NULL,
    "place_id" BIGINT,
    "visit_verification_id" BIGINT,
    "user_food_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "place_id" BIGINT,
    "user_food_id" BIGINT,
    "visit_verification_id" BIGINT,
    "visited_at" TIMESTAMPTZ(6),
    "title" VARCHAR(50) NOT NULL,
    "body" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_images" (
    "id" BIGSERIAL NOT NULL,
    "post_id" BIGINT NOT NULL,
    "image_url" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_trend_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "summary_text" TEXT,
    "keywords" JSONB,
    "period_start" DATE,
    "period_end" DATE,
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "model_version" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_external_contents" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "content_type" VARCHAR(30) NOT NULL,
    "title" VARCHAR(500),
    "url" TEXT NOT NULL,
    "author" VARCHAR(300),
    "published_at" TIMESTAMPTZ(6),
    "collected_at" TIMESTAMPTZ(6),

    CONSTRAINT "place_external_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_issue_reports" (
    "id" BIGSERIAL NOT NULL,
    "place_id" BIGINT NOT NULL,
    "reporter_user_id" BIGINT NOT NULL,
    "external_content_id" BIGINT,
    "report_type" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "resolved_by_user_id" BIGINT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "place_id" BIGINT,
    "event_type" VARCHAR(80) NOT NULL,
    "session_id" VARCHAR(200),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sync_runs" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "sync_type" VARCHAR(20),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL,
    "result_count" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "external_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_sources_code_key" ON "external_sources"("code");

-- CreateIndex
CREATE INDEX "raw_tour_api_endpoint_content_id_idx" ON "raw_tour_api"("endpoint", "content_id");

-- CreateIndex
CREATE INDEX "raw_tour_api_fetched_at_idx" ON "raw_tour_api"("fetched_at");

-- CreateIndex
CREATE INDEX "raw_small_business_api_endpoint_business_id_idx" ON "raw_small_business_api"("endpoint", "business_id");

-- CreateIndex
CREATE INDEX "raw_small_business_api_fetched_at_idx" ON "raw_small_business_api"("fetched_at");

-- CreateIndex
CREATE INDEX "raw_region_visitor_api_endpoint_area_code_signgu_code_base__idx" ON "raw_region_visitor_api"("endpoint", "area_code", "signgu_code", "base_date");

-- CreateIndex
CREATE INDEX "raw_tourism_resource_demand_api_endpoint_area_code_signgu_c_idx" ON "raw_tourism_resource_demand_api"("endpoint", "area_code", "signgu_code", "base_month");

-- CreateIndex
CREATE INDEX "raw_tourism_demand_strength_api_endpoint_area_code_signgu_c_idx" ON "raw_tourism_demand_strength_api"("endpoint", "area_code", "signgu_code", "base_month");

-- CreateIndex
CREATE INDEX "raw_concentration_forecast_api_area_code_signgu_code_attrac_idx" ON "raw_concentration_forecast_api"("area_code", "signgu_code", "attraction_name", "fetched_at");

-- CreateIndex
CREATE INDEX "raw_naver_datalab_api_start_date_end_date_fetched_at_idx" ON "raw_naver_datalab_api"("start_date", "end_date", "fetched_at");

-- CreateIndex
CREATE INDEX "regions_parent_id_idx" ON "regions"("parent_id");

-- CreateIndex
CREATE INDEX "regions_name_region_type_idx" ON "regions"("name", "region_type");

-- CreateIndex
CREATE UNIQUE INDEX "region_external_codes_source_id_code_type_external_code_key" ON "region_external_codes"("source_id", "code_type", "external_code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "category_mappings_source_id_scheme_external_level_external__key" ON "category_mappings"("source_id", "scheme", "external_level", "external_code");

-- CreateIndex
CREATE INDEX "places_district_region_id_category_id_idx" ON "places"("district_region_id", "category_id");

-- CreateIndex
CREATE INDEX "places_name_idx" ON "places"("name");

-- CreateIndex
CREATE INDEX "place_external_ids_place_id_source_id_idx" ON "place_external_ids"("place_id", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "place_external_ids_source_id_id_type_external_id_key" ON "place_external_ids"("source_id", "id_type", "external_id");

-- CreateIndex
CREATE INDEX "region_metrics_region_id_metric_family_metric_code_period_d_idx" ON "region_metrics"("region_id", "metric_family", "metric_code", "period_date", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "naver_search_terms_place_id_version_key" ON "naver_search_terms"("place_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "naver_search_interest_raw_naver_datalab_id_naver_search_ter_key" ON "naver_search_interest"("raw_naver_datalab_id", "naver_search_term_id", "period_start");

-- CreateIndex
CREATE INDEX "gap_score_history_place_id_calculated_at_idx" ON "gap_score_history"("place_id", "calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_social_accounts_user_id_platform_social_user_id_key" ON "user_social_accounts"("user_id", "platform", "social_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_accounts_user_id_key" ON "business_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_accounts_place_id_key" ON "business_accounts"("place_id");

-- CreateIndex
CREATE UNIQUE INDEX "place_operating_hours_place_id_day_of_week_key" ON "place_operating_hours"("place_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "place_special_hours_place_id_target_date_key" ON "place_special_hours"("place_id", "target_date");

-- CreateIndex
CREATE UNIQUE INDEX "place_verification_hours_place_id_day_of_week_key" ON "place_verification_hours"("place_id", "day_of_week");

-- CreateIndex
CREATE INDEX "visit_verifications_user_id_place_id_created_at_idx" ON "visit_verifications"("user_id", "place_id", "created_at");

-- CreateIndex
CREATE INDEX "visit_verifications_place_id_status_expires_at_idx" ON "visit_verifications"("place_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "place_ingredient_rewards_place_id_ingredient_id_reward_rule_idx" ON "place_ingredient_rewards"("place_id", "ingredient_id", "reward_rule");

-- CreateIndex
CREATE INDEX "user_foods_user_id_made_at_idx" ON "user_foods"("user_id", "made_at");

-- CreateIndex
CREATE INDEX "ingredient_transactions_user_id_ingredient_id_created_at_idx" ON "ingredient_transactions"("user_id", "ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "ingredient_transactions_user_id_place_id_transaction_type_idx" ON "ingredient_transactions"("user_id", "place_id", "transaction_type");

-- CreateIndex
CREATE UNIQUE INDEX "post_images_post_id_display_order_key" ON "post_images"("post_id", "display_order");

-- CreateIndex
CREATE INDEX "place_trend_snapshots_place_id_generated_at_idx" ON "place_trend_snapshots"("place_id", "generated_at");

-- CreateIndex
CREATE INDEX "place_external_contents_place_id_collected_at_idx" ON "place_external_contents"("place_id", "collected_at");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_occurred_at_idx" ON "analytics_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_place_id_occurred_at_idx" ON "analytics_events"("place_id", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_occurred_at_idx" ON "analytics_events"("user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "raw_tour_api" ADD CONSTRAINT "raw_tour_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_small_business_api" ADD CONSTRAINT "raw_small_business_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_region_visitor_api" ADD CONSTRAINT "raw_region_visitor_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_tourism_resource_demand_api" ADD CONSTRAINT "raw_tourism_resource_demand_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_tourism_demand_strength_api" ADD CONSTRAINT "raw_tourism_demand_strength_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_concentration_forecast_api" ADD CONSTRAINT "raw_concentration_forecast_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_naver_datalab_api" ADD CONSTRAINT "raw_naver_datalab_api_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_external_codes" ADD CONSTRAINT "region_external_codes_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_external_codes" ADD CONSTRAINT "region_external_codes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mappings" ADD CONSTRAINT "category_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_district_region_id_fkey" FOREIGN KEY ("district_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_admin_dong_region_id_fkey" FOREIGN KEY ("admin_dong_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_legal_dong_region_id_fkey" FOREIGN KEY ("legal_dong_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_external_ids" ADD CONSTRAINT "place_external_ids_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_external_ids" ADD CONSTRAINT "place_external_ids_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_metrics" ADD CONSTRAINT "region_metrics_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "region_metrics" ADD CONSTRAINT "region_metrics_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naver_search_terms" ADD CONSTRAINT "naver_search_terms_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naver_search_interest" ADD CONSTRAINT "naver_search_interest_raw_naver_datalab_id_fkey" FOREIGN KEY ("raw_naver_datalab_id") REFERENCES "raw_naver_datalab_api"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naver_search_interest" ADD CONSTRAINT "naver_search_interest_naver_search_term_id_fkey" FOREIGN KEY ("naver_search_term_id") REFERENCES "naver_search_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_score_history" ADD CONSTRAINT "gap_score_history_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_score_history" ADD CONSTRAINT "gap_score_history_comparison_region_id_fkey" FOREIGN KEY ("comparison_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_score_history" ADD CONSTRAINT "gap_score_history_comparison_category_id_fkey" FOREIGN KEY ("comparison_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_social_accounts" ADD CONSTRAINT "user_social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_images" ADD CONSTRAINT "place_images_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_operating_hours" ADD CONSTRAINT "place_operating_hours_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_operating_hours" ADD CONSTRAINT "place_operating_hours_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_special_hours" ADD CONSTRAINT "place_special_hours_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_special_hours" ADD CONSTRAINT "place_special_hours_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_benefits" ADD CONSTRAINT "place_benefits_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_benefits" ADD CONSTRAINT "place_benefits_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_verification_settings" ADD CONSTRAINT "place_verification_settings_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_verification_settings" ADD CONSTRAINT "place_verification_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_verification_hours" ADD CONSTRAINT "place_verification_hours_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_verifications" ADD CONSTRAINT "visit_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_verifications" ADD CONSTRAINT "visit_verifications_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_ingredient_rewards" ADD CONSTRAINT "place_ingredient_rewards_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_ingredient_rewards" ADD CONSTRAINT "place_ingredient_rewards_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ingredients" ADD CONSTRAINT "user_ingredients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ingredients" ADD CONSTRAINT "user_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_recipe_ingredients" ADD CONSTRAINT "food_recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_recipe_ingredients" ADD CONSTRAINT "food_recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_foods" ADD CONSTRAINT "user_foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_foods" ADD CONSTRAINT "user_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_foods" ADD CONSTRAINT "user_foods_special_ingredient_id_fkey" FOREIGN KEY ("special_ingredient_id") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_foods" ADD CONSTRAINT "user_foods_special_source_place_id_fkey" FOREIGN KEY ("special_source_place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_transactions" ADD CONSTRAINT "ingredient_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_transactions" ADD CONSTRAINT "ingredient_transactions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_transactions" ADD CONSTRAINT "ingredient_transactions_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_transactions" ADD CONSTRAINT "ingredient_transactions_visit_verification_id_fkey" FOREIGN KEY ("visit_verification_id") REFERENCES "visit_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_transactions" ADD CONSTRAINT "ingredient_transactions_user_food_id_fkey" FOREIGN KEY ("user_food_id") REFERENCES "user_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_food_id_fkey" FOREIGN KEY ("user_food_id") REFERENCES "user_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_visit_verification_id_fkey" FOREIGN KEY ("visit_verification_id") REFERENCES "visit_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_trend_snapshots" ADD CONSTRAINT "place_trend_snapshots_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_external_contents" ADD CONSTRAINT "place_external_contents_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_issue_reports" ADD CONSTRAINT "place_issue_reports_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_issue_reports" ADD CONSTRAINT "place_issue_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_issue_reports" ADD CONSTRAINT "place_issue_reports_external_content_id_fkey" FOREIGN KEY ("external_content_id") REFERENCES "place_external_contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_issue_reports" ADD CONSTRAINT "place_issue_reports_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sync_runs" ADD CONSTRAINT "external_sync_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
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
ADD CONSTRAINT "chk_ranking_filter"
CHECK ("ranking_category_filter" IN ('ALL', 'FOOD', 'CAFE', 'ACTIVITY'));

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