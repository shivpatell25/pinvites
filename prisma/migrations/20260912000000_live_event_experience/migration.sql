-- Add practical event-day details.
ALTER TABLE "events"
  ADD COLUMN "what_to_bring" TEXT,
  ADD COLUMN "arrival_instructions" TEXT;

-- Expand the guest-facing activity vocabulary without exposing technical data.
ALTER TYPE "AnalyticsEventType" ADD VALUE 'GUEST_ADDED';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'GUEST_REMOVED';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'RSVP_ANSWERS_UPDATED';

-- Lightweight, host-authored event timeline.
CREATE TABLE "event_updates" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "message" VARCHAR(2000) NOT NULL,
  "is_important" BOOLEAN NOT NULL DEFAULT false,
  "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_updates_event_id_posted_at_idx"
  ON "event_updates"("event_id", "posted_at");

ALTER TABLE "event_updates"
  ADD CONSTRAINT "event_updates_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_updates"
  ADD CONSTRAINT "event_updates_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "admins"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
