/*
  Warnings:

  - A unique constraint covering the columns `[naver_search_term_id,period_start]` on the table `naver_search_interest` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "naver_search_interest_raw_naver_datalab_id_naver_search_ter_key";

-- AlterTable
ALTER TABLE "naver_search_interest" ALTER COLUMN "ratio" SET DATA TYPE DECIMAL(12,6);

-- CreateIndex
CREATE UNIQUE INDEX "naver_search_interest_naver_search_term_id_period_start_key" ON "naver_search_interest"("naver_search_term_id", "period_start");
