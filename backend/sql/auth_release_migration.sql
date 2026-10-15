-- Apply with a DB backup before deploying the release-auth app/server together.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email varchar(254);
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_email ON users(email);
CREATE TABLE IF NOT EXISTS auth_sessions (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(user_id),
    access_hash varchar(64) NOT NULL UNIQUE,
    refresh_hash varchar(64) NOT NULL UNIQUE,
    access_expires_at timestamptz NOT NULL,
    refresh_expires_at timestamptz NOT NULL,
    revoked boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(refresh_expires_at);
CREATE TABLE IF NOT EXISTS email_challenges (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(user_id),
    token_hash varchar(64) NOT NULL UNIQUE,
    purpose varchar(255) NOT NULL,
    email varchar(254) NOT NULL,
    expires_at timestamptz NOT NULL,
    used boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_email_challenges_user ON email_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_email_challenges_expiry ON email_challenges(expires_at);
COMMIT;
