-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LoginAttemptOutcome" AS ENUM ('SUCCESS', 'INVALID_CREDENTIALS', 'RATE_LIMITED', 'INACTIVE_ACCOUNT', 'ERROR');

-- CreateEnum
CREATE TYPE "RateLimitScope" AS ENUM ('EMAIL', 'IP');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ArtworkKind" AS ENUM ('HERO', 'GALLERY');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('CREATED', 'QUEUED', 'SENT', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationTokenType" AS ENUM ('INVITATION', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "RsvpResponse" AS ENUM ('YES', 'MAYBE', 'NO');

-- CreateEnum
CREATE TYPE "RsvpSource" AS ENUM ('INVITATION', 'PUBLIC_EVENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CONFIRMED', 'MAYBE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "QuestionScope" AS ENUM ('HOUSEHOLD', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "QuestionConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'IS_ANSWERED', 'IS_NOT_ANSWERED');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('INVITATION', 'REMINDER', 'CONFIRMATION', 'RSVP_UPDATE', 'MANAGEMENT_LINK');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailAttemptStatus" AS ENUM ('STARTED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PUBLIC_EVENT_VIEWED', 'INVITATION_OPENED', 'RSVP_STARTED', 'RSVP_SUBMITTED', 'RSVP_UPDATED', 'CALENDAR_DOWNLOADED', 'QR_CODE_OPENED');

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent" VARCHAR(512),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "idle_expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "email_hash" CHAR(64) NOT NULL,
    "ip_hash" CHAR(64) NOT NULL,
    "outcome" "LoginAttemptOutcome" NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_rate_limit_buckets" (
    "id" UUID NOT NULL,
    "scope" "RateLimitScope" NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "subtitle" VARCHAR(240),
    "host_name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "details" TEXT,
    "timezone" VARCHAR(100) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "rsvp_deadline" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "party_size_limit" INTEGER NOT NULL DEFAULT 1,
    "allow_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "allow_maybe" BOOLEAN NOT NULL DEFAULT true,
    "venue_name" VARCHAR(200),
    "venue_address" TEXT,
    "venue_url" VARCHAR(2048),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "dress_code" VARCHAR(160),
    "primary_color" VARCHAR(9),
    "hero_artwork_id" UUID,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_artwork" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kind" "ArtworkKind" NOT NULL DEFAULT 'GALLERY',
    "storage_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt_text" VARCHAR(300),
    "focal_point_x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "focal_point_y" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_artwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "external_id" VARCHAR(120),
    "display_name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(160) NOT NULL,
    "contact_email" VARCHAR(320),
    "normalized_email" VARCHAR(320),
    "contact_phone" VARCHAR(40),
    "party_size_limit" INTEGER NOT NULL DEFAULT 1,
    "allow_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "normalized_email" VARCHAR(320),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'CREATED',
    "queued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "first_opened_at" TIMESTAMP(3),
    "last_opened_at" TIMESTAMP(3),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "responded_at" TIMESTAMP(3),
    "last_reminder_at" TIMESTAMP(3),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_tokens" (
    "id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "type" "InvitationTokenType" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvps" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "invitation_id" UUID,
    "response" "RsvpResponse" NOT NULL,
    "message" TEXT,
    "contact_email" VARCHAR(320),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_submissions" (
    "id" UUID NOT NULL,
    "rsvp_id" UUID NOT NULL,
    "invitation_id" UUID,
    "actor_admin_id" UUID,
    "revision" INTEGER NOT NULL,
    "source" "RsvpSource" NOT NULL,
    "response" "RsvpResponse" NOT NULL,
    "confirmed_attendee_count" INTEGER NOT NULL DEFAULT 0,
    "maybe_attendee_count" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "ip_hash" CHAR(64),
    "user_agent" VARCHAR(512),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvp_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendees" (
    "id" UUID NOT NULL,
    "rsvp_id" UUID NOT NULL,
    "guest_id" UUID,
    "full_name" VARCHAR(160) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "meal_option_id" UUID,
    "dietary_restrictions" TEXT,
    "is_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_options" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "prompt" VARCHAR(300) NOT NULL,
    "help_text" VARCHAR(500),
    "type" "QuestionType" NOT NULL,
    "scope" "QuestionScope" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "visible_for_responses" "RsvpResponse"[] DEFAULT ARRAY['YES', 'MAYBE']::"RsvpResponse"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_conditions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "source_question_id" UUID NOT NULL,
    "operator" "QuestionConditionOperator" NOT NULL,
    "option_id" UUID,
    "text_value" TEXT,
    "boolean_value" BOOLEAN,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_answers" (
    "id" UUID NOT NULL,
    "rsvp_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "attendee_id" UUID,
    "subject_key" VARCHAR(36) NOT NULL,
    "text_value" TEXT,
    "boolean_value" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rsvp_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_answer_options" (
    "answer_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "rsvp_answer_options_pkey" PRIMARY KEY ("answer_id","option_id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "household_id" UUID,
    "invitation_id" UUID,
    "rsvp_id" UUID,
    "type" "EmailType" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "to_email" VARCHAR(320) NOT NULL,
    "from_email" VARCHAR(320),
    "reply_to" VARCHAR(320),
    "subject" VARCHAR(300) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "provider_message_id" VARCHAR(500),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_delivery_attempts" (
    "id" UUID NOT NULL,
    "email_log_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "EmailAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "provider_message_id" VARCHAR(500),
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "email_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "household_id" UUID,
    "invitation_id" UUID,
    "rsvp_id" UUID,
    "type" "AnalyticsEventType" NOT NULL,
    "anonymous_id_hash" CHAR(64),
    "ip_hash" CHAR(64),
    "user_agent" VARCHAR(512),
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "event_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "ip_hash" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admins_normalized_email_key" ON "admins"("normalized_email");

-- CreateIndex
CREATE INDEX "admins_is_active_created_at_idx" ON "admins"("is_active", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_revoked_at_expires_at_idx" ON "admin_sessions"("admin_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "admin_sessions_idle_expires_at_idx" ON "admin_sessions"("idle_expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_email_hash_attempted_at_idx" ON "login_attempts"("email_hash", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_ip_hash_attempted_at_idx" ON "login_attempts"("ip_hash", "attempted_at");

-- CreateIndex
CREATE INDEX "login_attempts_outcome_attempted_at_idx" ON "login_attempts"("outcome", "attempted_at");

-- CreateIndex
CREATE INDEX "login_rate_limit_buckets_blocked_until_idx" ON "login_rate_limit_buckets"("blocked_until");

-- CreateIndex
CREATE INDEX "login_rate_limit_buckets_updated_at_idx" ON "login_rate_limit_buckets"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "login_rate_limit_buckets_scope_key_hash_key" ON "login_rate_limit_buckets"("scope", "key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "events_hero_artwork_id_key" ON "events"("hero_artwork_id");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "events_is_public_status_idx" ON "events"("is_public", "status");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_artwork_storage_key_key" ON "event_artwork"("storage_key");

-- CreateIndex
CREATE INDEX "event_artwork_event_id_kind_sort_order_idx" ON "event_artwork"("event_id", "kind", "sort_order");

-- CreateIndex
CREATE INDEX "households_event_id_normalized_email_idx" ON "households"("event_id", "normalized_email");

-- CreateIndex
CREATE INDEX "households_event_id_display_name_idx" ON "households"("event_id", "display_name");

-- CreateIndex
CREATE INDEX "households_event_id_archived_at_created_at_idx" ON "households"("event_id", "archived_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "households_event_id_external_id_key" ON "households"("event_id", "external_id");

-- CreateIndex
CREATE INDEX "guests_household_id_sort_order_idx" ON "guests"("household_id", "sort_order");

-- CreateIndex
CREATE INDEX "guests_normalized_email_idx" ON "guests"("normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_household_id_key" ON "invitations"("household_id");

-- CreateIndex
CREATE INDEX "invitations_status_sent_at_idx" ON "invitations"("status", "sent_at");

-- CreateIndex
CREATE INDEX "invitations_responded_at_idx" ON "invitations"("responded_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_token_hash_key" ON "invitation_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "invitation_tokens_invitation_id_type_revoked_at_idx" ON "invitation_tokens"("invitation_id", "type", "revoked_at");

-- CreateIndex
CREATE INDEX "invitation_tokens_expires_at_idx" ON "invitation_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_household_id_key" ON "rsvps"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvps_invitation_id_key" ON "rsvps"("invitation_id");

-- CreateIndex
CREATE INDEX "rsvps_response_submitted_at_idx" ON "rsvps"("response", "submitted_at");

-- CreateIndex
CREATE INDEX "rsvps_updated_at_idx" ON "rsvps"("updated_at");

-- CreateIndex
CREATE INDEX "rsvp_submissions_submitted_at_idx" ON "rsvp_submissions"("submitted_at");

-- CreateIndex
CREATE INDEX "rsvp_submissions_invitation_id_submitted_at_idx" ON "rsvp_submissions"("invitation_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_submissions_rsvp_id_revision_key" ON "rsvp_submissions"("rsvp_id", "revision");

-- CreateIndex
CREATE INDEX "attendees_rsvp_id_status_idx" ON "attendees"("rsvp_id", "status");

-- CreateIndex
CREATE INDEX "attendees_meal_option_id_status_idx" ON "attendees"("meal_option_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendees_rsvp_id_guest_id_key" ON "attendees"("rsvp_id", "guest_id");

-- CreateIndex
CREATE INDEX "meal_options_event_id_is_active_sort_order_idx" ON "meal_options"("event_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "meal_options_event_id_name_key" ON "meal_options"("event_id", "name");

-- CreateIndex
CREATE INDEX "questions_event_id_is_active_sort_order_idx" ON "questions"("event_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "question_options_question_id_is_active_sort_order_idx" ON "question_options"("question_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_label_key" ON "question_options"("question_id", "label");

-- CreateIndex
CREATE INDEX "question_conditions_question_id_sort_order_idx" ON "question_conditions"("question_id", "sort_order");

-- CreateIndex
CREATE INDEX "question_conditions_source_question_id_idx" ON "question_conditions"("source_question_id");

-- CreateIndex
CREATE INDEX "rsvp_answers_question_id_idx" ON "rsvp_answers"("question_id");

-- CreateIndex
CREATE INDEX "rsvp_answers_attendee_id_idx" ON "rsvp_answers"("attendee_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_answers_rsvp_id_question_id_subject_key_key" ON "rsvp_answers"("rsvp_id", "question_id", "subject_key");

-- CreateIndex
CREATE INDEX "rsvp_answer_options_option_id_idx" ON "rsvp_answer_options"("option_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_idempotency_key_key" ON "email_logs"("idempotency_key");

-- CreateIndex
CREATE INDEX "email_logs_event_id_created_at_idx" ON "email_logs"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_invitation_id_type_status_idx" ON "email_logs"("invitation_id", "type", "status");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_delivery_attempts_status_started_at_idx" ON "email_delivery_attempts"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_delivery_attempts_email_log_id_attempt_number_key" ON "email_delivery_attempts"("email_log_id", "attempt_number");

-- CreateIndex
CREATE INDEX "analytics_events_event_id_type_occurred_at_idx" ON "analytics_events"("event_id", "type", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_invitation_id_occurred_at_idx" ON "analytics_events"("invitation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_created_at_idx" ON "audit_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_event_id_created_at_idx" ON "audit_logs"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_hero_artwork_id_fkey" FOREIGN KEY ("hero_artwork_id") REFERENCES "event_artwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_artwork" ADD CONSTRAINT "event_artwork_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_artwork" ADD CONSTRAINT "event_artwork_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_meal_option_id_fkey" FOREIGN KEY ("meal_option_id") REFERENCES "meal_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_options" ADD CONSTRAINT "meal_options_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "question_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_answers" ADD CONSTRAINT "rsvp_answers_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_answers" ADD CONSTRAINT "rsvp_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_answers" ADD CONSTRAINT "rsvp_answers_attendee_id_fkey" FOREIGN KEY ("attendee_id") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_answer_options" ADD CONSTRAINT "rsvp_answer_options_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "rsvp_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_answer_options" ADD CONSTRAINT "rsvp_answer_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "question_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_rsvp_id_fkey" FOREIGN KEY ("rsvp_id") REFERENCES "rsvps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints that Prisma cannot currently express in the schema.
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_expiry_order_check"
  CHECK ("idle_expires_at" <= "expires_at" AND "expires_at" > "created_at");
ALTER TABLE "login_rate_limit_buckets" ADD CONSTRAINT "login_rate_limit_failure_count_check"
  CHECK ("failure_count" >= 0);
ALTER TABLE "events" ADD CONSTRAINT "events_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
ALTER TABLE "events" ADD CONSTRAINT "events_party_size_limit_check"
  CHECK ("party_size_limit" BETWEEN 1 AND 1000);
ALTER TABLE "events" ADD CONSTRAINT "events_date_order_check"
  CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at");
ALTER TABLE "events" ADD CONSTRAINT "events_coordinates_check"
  CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "events" ADD CONSTRAINT "events_primary_color_check"
  CHECK ("primary_color" IS NULL OR "primary_color" ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$');
ALTER TABLE "event_artwork" ADD CONSTRAINT "event_artwork_dimensions_check"
  CHECK ("byte_size" > 0 AND "width" > 0 AND "height" > 0);
ALTER TABLE "event_artwork" ADD CONSTRAINT "event_artwork_focal_point_check"
  CHECK ("focal_point_x" BETWEEN 0 AND 1 AND "focal_point_y" BETWEEN 0 AND 1);
ALTER TABLE "event_artwork" ADD CONSTRAINT "event_artwork_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "households" ADD CONSTRAINT "households_party_size_limit_check"
  CHECK ("party_size_limit" BETWEEN 1 AND 1000);
ALTER TABLE "guests" ADD CONSTRAINT "guests_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_counters_check"
  CHECK ("open_count" >= 0 AND "reminder_count" >= 0);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_open_dates_check"
  CHECK ("first_opened_at" IS NULL OR "last_opened_at" IS NULL OR "last_opened_at" >= "first_opened_at");
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_expiry_check"
  CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_revision_check"
  CHECK ("revision" >= 1);
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_counts_check"
  CHECK (
    "revision" >= 1 AND
    "confirmed_attendee_count" >= 0 AND
    "maybe_attendee_count" >= 0 AND
    (("response" = 'YES' AND "maybe_attendee_count" = 0) OR
     ("response" = 'MAYBE' AND "confirmed_attendee_count" = 0) OR
     ("response" = 'NO' AND "confirmed_attendee_count" = 0 AND "maybe_attendee_count" = 0))
  );
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "meal_options" ADD CONSTRAINT "meal_options_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "questions" ADD CONSTRAINT "questions_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_sort_order_check"
  CHECK ("sort_order" >= 0);
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_value_check"
  CHECK (
    "sort_order" >= 0 AND
    (("operator" IN ('IS_ANSWERED', 'IS_NOT_ANSWERED') AND "option_id" IS NULL AND "text_value" IS NULL AND "boolean_value" IS NULL) OR
     ("operator" NOT IN ('IS_ANSWERED', 'IS_NOT_ANSWERED') AND num_nonnulls("option_id", "text_value", "boolean_value") = 1))
  );
ALTER TABLE "rsvp_answers" ADD CONSTRAINT "rsvp_answers_scalar_value_check"
  CHECK (num_nonnulls("text_value", "boolean_value") <= 1);
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_attempt_count_check"
  CHECK ("attempt_count" >= 0);
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_status_timestamp_check"
  CHECK (("status" <> 'SENT' OR "sent_at" IS NOT NULL) AND ("status" <> 'FAILED' OR "failed_at" IS NOT NULL));
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_number_check"
  CHECK ("attempt_number" >= 1);
ALTER TABLE "email_delivery_attempts" ADD CONSTRAINT "email_delivery_attempts_completion_check"
  CHECK ("status" = 'STARTED' OR "completed_at" IS NOT NULL);

-- A management link replaces its predecessor, while multiple invitation links
-- may remain valid so a reminder never invalidates the original email.
CREATE UNIQUE INDEX "invitation_tokens_one_active_management_key"
  ON "invitation_tokens"("invitation_id")
  WHERE "revoked_at" IS NULL AND "type" = 'MANAGEMENT';
CREATE UNIQUE INDEX "guests_one_primary_per_household_key"
  ON "guests"("household_id") WHERE "is_primary" = true;

-- Cross-relation integrity checks keep event-scoped data from being associated
-- with another event even if an application bug supplies otherwise-valid UUIDs.
CREATE FUNCTION pinvites_validate_event_hero_artwork() RETURNS trigger AS $$
BEGIN
  IF NEW."hero_artwork_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "event_artwork" artwork
    WHERE artwork."id" = NEW."hero_artwork_id" AND artwork."event_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Hero artwork must belong to its event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "events_validate_hero_artwork"
  BEFORE INSERT OR UPDATE OF "hero_artwork_id" ON "events"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_event_hero_artwork();

CREATE FUNCTION pinvites_validate_rsvp_invitation() RETURNS trigger AS $$
BEGIN
  IF NEW."invitation_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "invitations" invitation
    WHERE invitation."id" = NEW."invitation_id" AND invitation."household_id" = NEW."household_id"
  ) THEN
    RAISE EXCEPTION 'RSVP invitation must belong to the RSVP household';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rsvps_validate_invitation"
  BEFORE INSERT OR UPDATE OF "invitation_id", "household_id" ON "rsvps"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_rsvp_invitation();

CREATE FUNCTION pinvites_validate_attendee_scope() RETURNS trigger AS $$
DECLARE
  rsvp_household UUID;
  rsvp_event UUID;
BEGIN
  SELECT rsvp."household_id", household."event_id"
    INTO rsvp_household, rsvp_event
  FROM "rsvps" rsvp
  JOIN "households" household ON household."id" = rsvp."household_id"
  WHERE rsvp."id" = NEW."rsvp_id";

  IF NEW."guest_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "guests" guest
    WHERE guest."id" = NEW."guest_id" AND guest."household_id" = rsvp_household
  ) THEN
    RAISE EXCEPTION 'Attendee guest must belong to the RSVP household';
  END IF;

  IF NEW."meal_option_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "meal_options" meal
    WHERE meal."id" = NEW."meal_option_id" AND meal."event_id" = rsvp_event
  ) THEN
    RAISE EXCEPTION 'Attendee meal option must belong to the RSVP event';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attendees_validate_scope"
  BEFORE INSERT OR UPDATE OF "rsvp_id", "guest_id", "meal_option_id" ON "attendees"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_attendee_scope();

CREATE FUNCTION pinvites_validate_question_condition() RETURNS trigger AS $$
DECLARE
  target_event UUID;
BEGIN
  SELECT "event_id" INTO target_event FROM "questions" WHERE "id" = NEW."question_id";
  IF NOT EXISTS (
    SELECT 1 FROM "questions" source
    WHERE source."id" = NEW."source_question_id" AND source."event_id" = target_event
  ) THEN
    RAISE EXCEPTION 'Conditional questions must belong to the same event';
  END IF;
  IF NEW."option_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "question_options" option
    WHERE option."id" = NEW."option_id" AND option."question_id" = NEW."source_question_id"
  ) THEN
    RAISE EXCEPTION 'Condition option must belong to the source question';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "question_conditions_validate_scope"
  BEFORE INSERT OR UPDATE ON "question_conditions"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_question_condition();

CREATE FUNCTION pinvites_validate_rsvp_answer() RETURNS trigger AS $$
DECLARE
  rsvp_household UUID;
  rsvp_event UUID;
  question_scope "QuestionScope";
BEGIN
  SELECT rsvp."household_id", household."event_id"
    INTO rsvp_household, rsvp_event
  FROM "rsvps" rsvp
  JOIN "households" household ON household."id" = rsvp."household_id"
  WHERE rsvp."id" = NEW."rsvp_id";

  SELECT question."scope" INTO question_scope
  FROM "questions" question
  WHERE question."id" = NEW."question_id" AND question."event_id" = rsvp_event;
  IF question_scope IS NULL THEN
    RAISE EXCEPTION 'RSVP answer question must belong to the RSVP event';
  END IF;

  IF question_scope = 'HOUSEHOLD' THEN
    IF NEW."attendee_id" IS NOT NULL OR NEW."subject_key" <> rsvp_household::text THEN
      RAISE EXCEPTION 'Household answer has an invalid subject';
    END IF;
  ELSE
    IF NEW."attendee_id" IS NULL OR NEW."subject_key" <> NEW."attendee_id"::text OR NOT EXISTS (
      SELECT 1 FROM "attendees" attendee
      WHERE attendee."id" = NEW."attendee_id" AND attendee."rsvp_id" = NEW."rsvp_id"
    ) THEN
      RAISE EXCEPTION 'Attendee answer has an invalid subject';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rsvp_answers_validate_scope"
  BEFORE INSERT OR UPDATE ON "rsvp_answers"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_rsvp_answer();

CREATE FUNCTION pinvites_validate_answer_option() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "rsvp_answers" answer
    JOIN "question_options" option ON option."question_id" = answer."question_id"
    WHERE answer."id" = NEW."answer_id" AND option."id" = NEW."option_id"
  ) THEN
    RAISE EXCEPTION 'Selected option must belong to the answered question';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rsvp_answer_options_validate_scope"
  BEFORE INSERT OR UPDATE ON "rsvp_answer_options"
  FOR EACH ROW EXECUTE FUNCTION pinvites_validate_answer_option();
