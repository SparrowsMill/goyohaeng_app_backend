-- CreateTable
CREATE TABLE "place_favorites" (
    "user_id" BIGINT NOT NULL,
    "place_id" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_favorites_pkey" PRIMARY KEY ("user_id","place_id")
);

-- CreateIndex
CREATE INDEX "place_favorites_user_id_created_at_idx" ON "place_favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "place_favorites_place_id_idx" ON "place_favorites"("place_id");

-- AddForeignKey
ALTER TABLE "place_favorites" ADD CONSTRAINT "place_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_favorites" ADD CONSTRAINT "place_favorites_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
