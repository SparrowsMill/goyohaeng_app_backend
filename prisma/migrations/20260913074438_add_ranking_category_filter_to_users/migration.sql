ALTER TABLE "users"
ADD COLUMN "ranking_category_filter" VARCHAR(20) NOT NULL DEFAULT 'ALL';

ALTER TABLE "users"
ADD CONSTRAINT "chk_ranking_filter"
CHECK ("ranking_category_filter" IN ('ALL', 'FOOD', 'CAFE', 'ACTIVITY'));
