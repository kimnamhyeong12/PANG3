-- Existing local and social members keep their current login flow.
-- Only social accounts created by the updated server are marked pending.
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_profile_pending boolean NOT NULL DEFAULT false;
