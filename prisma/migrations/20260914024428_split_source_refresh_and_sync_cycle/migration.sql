-- Rename existing source refresh cadence column so existing values are preserved.
ALTER TABLE "external_sources"
RENAME COLUMN "refresh_cycle" TO "source_refresh_cycle";

-- Add cadence for Goyohaeng's own synchronization schedule.
ALTER TABLE "external_sources"
ADD COLUMN "sync_cycle" VARCHAR(100);