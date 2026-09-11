/*
  Warnings:

  - A unique constraint covering the columns `[place_id,run_id]` on the table `gap_score_history` will be added. If there are existing duplicate values, this will fail.
  - Made the column `rarity` on table `ingredients` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ingredients" ALTER COLUMN "rarity" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "gap_score_history_place_id_run_id_key" ON "gap_score_history"("place_id", "run_id");
