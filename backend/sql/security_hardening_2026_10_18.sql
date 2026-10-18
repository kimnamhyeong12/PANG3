-- Back up the database and apply before deploying the security changes.
BEGIN;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS previous_refresh_hash varchar(64);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS previous_refresh_until timestamptz;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_retry_ciphertext varchar(256);
CREATE UNIQUE INDEX IF NOT EXISTS uk_auth_sessions_previous_refresh ON auth_sessions(previous_refresh_hash);
-- Existing sessions retain their already assigned expiry; it no longer slides on refresh.
COMMIT;
