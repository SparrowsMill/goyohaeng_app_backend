-- AlterTable
ALTER TABLE "users"
ADD COLUMN "level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
ADD CONSTRAINT "chk_users_xp_nonnegative"
CHECK ("xp" >= 0);

ALTER TABLE "users"
ADD CONSTRAINT "chk_users_level_nonnegative"
CHECK ("level" >= 0);