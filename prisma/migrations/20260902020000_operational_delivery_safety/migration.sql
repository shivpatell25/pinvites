-- A short lease prevents archive and credential issuance from racing. Both
-- lease fields are present or absent together so a crashed process naturally
-- becomes recoverable when the timestamp expires.
ALTER TABLE "households"
  ADD COLUMN "delivery_lock_id" UUID,
  ADD COLUMN "delivery_locked_until" TIMESTAMP(3);

ALTER TABLE "households" ADD CONSTRAINT "households_delivery_lock_check"
  CHECK (num_nonnulls("delivery_lock_id", "delivery_locked_until") IN (0, 2));

CREATE INDEX "households_delivery_locked_until_idx"
  ON "households"("delivery_locked_until");

-- A manual approval grants exactly one additional attempt without erasing the
-- immutable attempt history or pretending an ambiguous SMTP result succeeded.
ALTER TABLE "email_logs"
  ADD COLUMN "manual_retry_approved_at" TIMESTAMP(3),
  ADD COLUMN "manual_retry_consumed_at" TIMESTAMP(3);

CREATE INDEX "email_logs_status_manual_retry_approved_at_idx"
  ON "email_logs"("status", "manual_retry_approved_at");
