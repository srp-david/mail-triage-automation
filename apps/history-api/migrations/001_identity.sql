CREATE TABLE team (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE app_user (
 id uuid PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, email text NOT NULL,
 active boolean NOT NULL DEFAULT true, UNIQUE(issuer,subject)
);
CREATE TABLE membership (
 user_id uuid NOT NULL REFERENCES app_user(id), team_id uuid NOT NULL REFERENCES team(id),
 role text NOT NULL CHECK(role IN ('viewer','analyst','admin')), active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(user_id,team_id)
);
CREATE TABLE source (
 id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES team(id), owner_user_id uuid NOT NULL REFERENCES app_user(id),
 instance_id uuid NOT NULL UNIQUE, display_name text NOT NULL, active boolean NOT NULL DEFAULT true,
 store_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_access (
 source_id uuid NOT NULL REFERENCES source(id), user_id uuid NOT NULL REFERENCES app_user(id),
 can_write boolean NOT NULL DEFAULT false, PRIMARY KEY(source_id,user_id)
);
CREATE TABLE runner (
 id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES app_user(id), credential_hash text NOT NULL,
 request_id uuid NOT NULL UNIQUE, display_name text NOT NULL, agents jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true, executor_kind text NOT NULL DEFAULT 'local' CHECK(executor_kind='local'),
 seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE runner_source (
 runner_id uuid NOT NULL REFERENCES runner(id), source_id uuid NOT NULL REFERENCES source(id), PRIMARY KEY(runner_id,source_id)
);
CREATE TABLE audit_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES app_user(id),
 action text NOT NULL, target_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing legacy remains outside v1 until explicit owner/collection mapping is reviewed.
CREATE TABLE legacy_collection (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL REFERENCES app_user(id),name text NOT NULL);
CREATE TABLE legacy_collection_document (
 collection_id uuid NOT NULL REFERENCES legacy_collection(id),document_id uuid NOT NULL UNIQUE REFERENCES legacy_document(id),
 PRIMARY KEY(collection_id,document_id)
);
