-- CreateTable
CREATE TABLE "place_coordinate_validations" (
    "place_id" BIGINT NOT NULL,
    "expected_district_region_id" BIGINT,
    "matched_district_region_id" BIGINT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "status" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(50),
    "validator_version" VARCHAR(30) NOT NULL,
    "validated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_coordinate_validations_pkey" PRIMARY KEY ("place_id")
);

-- CreateIndex
CREATE INDEX "place_coordinate_validations_status_idx" ON "place_coordinate_validations"("status");

-- CreateIndex
CREATE INDEX "place_coordinate_validations_expected_district_region_id_idx" ON "place_coordinate_validations"("expected_district_region_id");

-- CreateIndex
CREATE INDEX "place_coordinate_validations_matched_district_region_id_idx" ON "place_coordinate_validations"("matched_district_region_id");

-- AddForeignKey
ALTER TABLE "place_coordinate_validations" ADD CONSTRAINT "place_coordinate_validations_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_coordinate_validations" ADD CONSTRAINT "place_coordinate_validations_expected_district_region_id_fkey" FOREIGN KEY ("expected_district_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_coordinate_validations" ADD CONSTRAINT "place_coordinate_validations_matched_district_region_id_fkey" FOREIGN KEY ("matched_district_region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

