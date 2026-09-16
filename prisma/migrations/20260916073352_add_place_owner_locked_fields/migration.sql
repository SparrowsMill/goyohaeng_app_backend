-- AlterTable
ALTER TABLE "places" ADD COLUMN     "owner_locked_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "owner_updated_at" TIMESTAMPTZ(6);
