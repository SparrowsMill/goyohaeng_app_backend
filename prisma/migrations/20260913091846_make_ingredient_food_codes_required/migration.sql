/*
  Warnings:

  - Made the column `code` on table `foods` required. This step will fail if there are existing NULL values in that column.
  - Made the column `code` on table `ingredients` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "foods" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "ingredients" ALTER COLUMN "code" SET NOT NULL;
