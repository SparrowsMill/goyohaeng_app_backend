/*
  Warnings:

  - You are about to drop the column `ranking_category_filter` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `foods` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `ingredients` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "foods" ADD COLUMN     "code" VARCHAR(20);

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "code" VARCHAR(20);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "ranking_category_filter";

-- CreateIndex
CREATE UNIQUE INDEX "foods_code_key" ON "foods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_code_key" ON "ingredients"("code");
