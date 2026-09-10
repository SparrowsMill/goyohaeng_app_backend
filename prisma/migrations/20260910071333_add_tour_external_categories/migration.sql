-- CreateTable
CREATE TABLE "external_categories" (
    "id" BIGSERIAL NOT NULL,
    "source_id" BIGINT NOT NULL,
    "scheme" VARCHAR(80) NOT NULL,
    "level" INTEGER NOT NULL,
    "external_code" VARCHAR(100) NOT NULL,
    "external_name" VARCHAR(200) NOT NULL,
    "parent_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_external_categories" (
    "place_id" BIGINT NOT NULL,
    "external_category_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_external_categories_pkey" PRIMARY KEY ("place_id","external_category_id")
);

-- CreateIndex
CREATE INDEX "external_categories_parent_id_idx" ON "external_categories"("parent_id");

-- CreateIndex
CREATE INDEX "external_categories_source_id_scheme_level_idx" ON "external_categories"("source_id", "scheme", "level");

-- CreateIndex
CREATE UNIQUE INDEX "external_categories_source_id_scheme_level_external_code_key" ON "external_categories"("source_id", "scheme", "level", "external_code");

-- CreateIndex
CREATE INDEX "place_external_categories_external_category_id_idx" ON "place_external_categories"("external_category_id");

-- AddForeignKey
ALTER TABLE "external_categories" ADD CONSTRAINT "external_categories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_categories" ADD CONSTRAINT "external_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "external_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_external_categories" ADD CONSTRAINT "place_external_categories_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_external_categories" ADD CONSTRAINT "place_external_categories_external_category_id_fkey" FOREIGN KEY ("external_category_id") REFERENCES "external_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
