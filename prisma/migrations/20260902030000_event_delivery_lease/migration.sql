-- Event status transitions use the same short delivery lease as households so
-- an event cannot close or be archived between token issuance and external
-- delivery.
ALTER TABLE "events"
  ADD COLUMN "delivery_lock_id" UUID,
  ADD COLUMN "delivery_locked_until" TIMESTAMP(3);

ALTER TABLE "events" ADD CONSTRAINT "events_delivery_lock_check"
  CHECK (num_nonnulls("delivery_lock_id", "delivery_locked_until") IN (0, 2));

CREATE INDEX "events_delivery_locked_until_idx"
  ON "events"("delivery_locked_until");
