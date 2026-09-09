-- CreateTable
CREATE TABLE "public_rsvp_rate_limit_buckets" (
    "key_hash" CHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_rsvp_rate_limit_buckets_pkey" PRIMARY KEY ("key_hash")
);

-- CreateIndex
CREATE INDEX "public_rsvp_rate_limit_buckets_blocked_until_idx" ON "public_rsvp_rate_limit_buckets"("blocked_until");

-- CreateIndex
CREATE INDEX "public_rsvp_rate_limit_buckets_updated_at_idx" ON "public_rsvp_rate_limit_buckets"("updated_at");
