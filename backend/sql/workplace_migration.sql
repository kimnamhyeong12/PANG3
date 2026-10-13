-- Account workplace address and coordinates. Existing users register in Settings.
ALTER TABLE users ADD COLUMN IF NOT EXISTS workplace_address VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS workplace_lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS workplace_lng DOUBLE PRECISION;
