-- DropIndex
DROP INDEX "region_metrics_natural_key_key";
ALTER TABLE "regions"
DROP CONSTRAINT "chk_region_type";

ALTER TABLE "regions"
ADD CONSTRAINT "chk_region_type"
CHECK (
  "region_type" IN (
    'PROVINCE',
    'DISTRICT',
    'ADMIN_DONG',
    'LEGAL_DONG',
    'FOOD_REGION'
  )
);