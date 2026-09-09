-- A replacement management credential is created before SMTP delivery so the
-- currently working link is never invalidated by an unavailable mail server.
-- Once SMTP accepts the replacement, the application revokes every predecessor.
-- This deliberately permits a short overlap and also keeps the delivered link
-- usable if the process stops between SMTP acceptance and final cleanup.
DROP INDEX "invitation_tokens_one_active_management_key";
