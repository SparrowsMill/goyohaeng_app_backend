-- DropForeignKey
ALTER TABLE "business_accounts" DROP CONSTRAINT "business_accounts_place_id_fkey";

-- AlterTable
ALTER TABLE "business_accounts" ALTER COLUMN "place_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "business_accounts" ADD CONSTRAINT "business_accounts_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
