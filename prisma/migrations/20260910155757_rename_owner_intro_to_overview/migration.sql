/*
  Warnings:

  - You are about to drop the column `owner_intro` on the `places` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "places"
RENAME COLUMN "owner_intro" TO "overview";