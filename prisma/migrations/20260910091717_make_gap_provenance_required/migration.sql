/*
  Warnings:

  - Made the column `gap_metric_mapping_id` on table `gap_score_history` required. This step will fail if there are existing NULL values in that column.
  - Made the column `run_id` on table `gap_score_history` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "gap_score_history" ALTER COLUMN "gap_metric_mapping_id" SET NOT NULL,
ALTER COLUMN "run_id" SET NOT NULL;
