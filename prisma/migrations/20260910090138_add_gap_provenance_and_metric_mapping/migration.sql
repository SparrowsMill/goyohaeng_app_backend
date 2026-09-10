/*
  Schema-only migration.

  실제 운영 데이터에 대한 seed/backfill은
  shadow database와 분리하기 위해 migration 밖에서 수행한다.
*/


/* ============================================================
   1. Gap metric mapping
   ============================================================ */

CREATE TABLE "gap_metric_mappings" (
    "id" BIGSERIAL NOT NULL,
    "formula_version" VARCHAR(50) NOT NULL,
    "external_category_id" BIGINT NOT NULL,
    "sns_metric_code" VARCHAR(50),
    "navigation_metric_code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gap_metric_mappings_pkey"
        PRIMARY KEY ("id")
);


/* ============================================================
   2. Gap score calculation run
   ============================================================ */

CREATE TABLE "gap_score_runs" (
    "id" BIGSERIAL NOT NULL,
    "formula_version" VARCHAR(50) NOT NULL,
    "data_stage" VARCHAR(20) NOT NULL,

    "naver_start_date" DATE NOT NULL,
    "naver_end_date" DATE NOT NULL,

    "regional_metric_month" CHAR(6) NOT NULL,

    "visitor_start_date" DATE NOT NULL,
    "visitor_end_date" DATE NOT NULL,

    "naver_reference_term" VARCHAR(300) NOT NULL,

    "calculated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gap_score_runs_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "chk_gap_score_runs_data_stage"
        CHECK (
            "data_stage" IN (
                'COLD_START',
                'HYBRID',
                'MATURE'
            )
        ),

    CONSTRAINT "chk_gap_score_runs_naver_dates"
        CHECK (
            "naver_start_date" <= "naver_end_date"
        ),

    CONSTRAINT "chk_gap_score_runs_visitor_dates"
        CHECK (
            "visitor_start_date" <= "visitor_end_date"
        )
);


/* ============================================================
   3. Existing Gap Score rows:
      nullable first, then production backfill later
   ============================================================ */

ALTER TABLE "gap_score_history"
    ADD COLUMN "gap_metric_mapping_id" BIGINT,
    ADD COLUMN "run_id" BIGINT;


/* ============================================================
   4. Indexes
   ============================================================ */

CREATE INDEX
    "gap_metric_mappings_external_category_id_idx"
ON "gap_metric_mappings"("external_category_id");


CREATE UNIQUE INDEX
    "gap_metric_mappings_formula_version_external_category_id_key"
ON "gap_metric_mappings"(
    "formula_version",
    "external_category_id"
);


CREATE INDEX
    "gap_score_runs_formula_version_calculated_at_idx"
ON "gap_score_runs"(
    "formula_version",
    "calculated_at"
);


CREATE INDEX
    "gap_score_history_run_id_idx"
ON "gap_score_history"("run_id");


CREATE INDEX
    "gap_score_history_gap_metric_mapping_id_idx"
ON "gap_score_history"("gap_metric_mapping_id");


/* ============================================================
   5. Foreign keys
   ============================================================ */

ALTER TABLE "gap_metric_mappings"
ADD CONSTRAINT
    "gap_metric_mappings_external_category_id_fkey"
FOREIGN KEY ("external_category_id")
REFERENCES "external_categories"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "gap_score_history"
ADD CONSTRAINT
    "gap_score_history_run_id_fkey"
FOREIGN KEY ("run_id")
REFERENCES "gap_score_runs"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


ALTER TABLE "gap_score_history"
ADD CONSTRAINT
    "gap_score_history_gap_metric_mapping_id_fkey"
FOREIGN KEY ("gap_metric_mapping_id")
REFERENCES "gap_metric_mappings"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;