-- Additive: existing UUIDs and ownership remain unchanged; no implicit identity mapping.
ALTER TABLE app_user ALTER COLUMN issuer DROP NOT NULL;
ALTER TABLE app_user ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE app_user ALTER COLUMN email DROP NOT NULL;
ALTER TABLE app_user ADD COLUMN username text UNIQUE;
ALTER TABLE app_user ADD COLUMN display_name text;
ALTER TABLE app_user ADD CONSTRAINT username_format CHECK(username IS NULL OR username ~ '^[a-z][a-z0-9_.-]{2,31}$');
CREATE TABLE user_credential (
 user_id uuid PRIMARY KEY REFERENCES app_user(id), password_hash text NOT NULL,
 must_change boolean NOT NULL DEFAULT true, temporary_until timestamptz,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_session (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_user(id),
 restricted boolean NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE refresh_token (
 token_hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES auth_session(id),
 used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_session ON refresh_token(session_id);
CREATE TABLE auth_throttle (
 bucket text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL
);
-- These tables are server-only. Supabase deployment also revokes schema access.
REVOKE ALL ON user_credential,auth_session,refresh_token,auth_throttle FROM PUBLIC;
