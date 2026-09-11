/*
  Warnings:

  - A unique constraint covering the columns `[place_id,url]` on the table `place_external_contents` will be added. If there are existing duplicate values, this will fail.
  - Made the column `collected_at` on table `place_external_contents` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "place_external_contents" ADD COLUMN     "author_url" TEXT,
ADD COLUMN     "description" TEXT,
ALTER COLUMN "collected_at" SET NOT NULL,
ALTER COLUMN "collected_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "place_external_contents_place_id_url_key" ON "place_external_contents"("place_id", "url");
