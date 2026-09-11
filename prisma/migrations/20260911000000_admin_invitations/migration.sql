ALTER TYPE "EmailType" ADD VALUE 'ADMIN_INVITE';

CREATE TABLE "admin_invites" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "delivery_version" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT,
    "invited_by_id" UUID NOT NULL,
    "accepted_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_invites_token_hash_key" ON "admin_invites"("token_hash");
CREATE UNIQUE INDEX "admin_invites_accepted_admin_id_key" ON "admin_invites"("accepted_admin_id");
CREATE INDEX "admin_invites_normalized_email_accepted_at_revoked_at_idx" ON "admin_invites"("normalized_email", "accepted_at", "revoked_at");
CREATE INDEX "admin_invites_invited_by_id_created_at_idx" ON "admin_invites"("invited_by_id", "created_at");
CREATE INDEX "admin_invites_expires_at_idx" ON "admin_invites"("expires_at");

ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_accepted_admin_id_fkey" FOREIGN KEY ("accepted_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
