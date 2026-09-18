CREATE TABLE IF NOT EXISTS mail_identity (
  id uuid PRIMARY KEY, store_id text NOT NULL, mail_id bigint NOT NULL,
  message_id text, subject text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, mail_id)
);
CREATE TABLE IF NOT EXISTS analysis_run (
  id uuid PRIMARY KEY, mail_key uuid NOT NULL REFERENCES mail_identity(id),
  source text NOT NULL CHECK(source IN ('direct','web')),
  request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('queued','running','completed','needs_input','failed')),
  owner_hash text, lease_until timestamptz,
  parent_id uuid REFERENCES analysis_run(id), answer text, error text,
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_mail ON analysis_run(mail_key) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS analysis_by_mail ON analysis_run(mail_key,created_at DESC,id DESC);
ALTER TABLE analysis_run ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;
ALTER TABLE analysis_run ADD COLUMN IF NOT EXISTS progress_events jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS report_version (
  run_id uuid PRIMARY KEY REFERENCES analysis_run(id), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS review (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES report_version(run_id),
  request_id uuid NOT NULL UNIQUE, author text NOT NULL, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sync_run (
  id uuid PRIMARY KEY, status text NOT NULL,
  saved integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0,
  remaining integer, warnings integer NOT NULL DEFAULT 0, detail jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS worker_state (name text PRIMARY KEY, seen_at timestamptz NOT NULL, state text NOT NULL);
ALTER TABLE sync_run ADD COLUMN IF NOT EXISTS batch_count integer NOT NULL DEFAULT 0;
ALTER TABLE sync_run ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE sync_run ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE sync_run ADD COLUMN IF NOT EXISTS uncertain boolean NOT NULL DEFAULT false;

ALTER TABLE mail_identity ALTER COLUMN mail_id DROP NOT NULL;
ALTER TABLE mail_identity ADD COLUMN IF NOT EXISTS identity_kind text NOT NULL DEFAULT 'mcp';
ALTER TABLE mail_identity ADD COLUMN IF NOT EXISTS external_key text;
ALTER TABLE mail_identity ADD COLUMN IF NOT EXISTS external_source_hash text;
ALTER TABLE mail_identity ADD COLUMN IF NOT EXISTS handled_at timestamptz;
CREATE TABLE IF NOT EXISTS related_mail (
  id uuid PRIMARY KEY, mail_key uuid NOT NULL REFERENCES mail_identity(id),
  store_id text NOT NULL, mail_id bigint NOT NULL, message_id text NOT NULL,
  metadata jsonb NOT NULL, linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mail_key,store_id,mail_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS external_identity_key ON mail_identity(store_id,external_key) WHERE external_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS legacy_document (
  id uuid PRIMARY KEY, namespace text NOT NULL, source_path text NOT NULL, source_hash text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('report','log')), body text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(), UNIQUE(namespace,source_path,source_hash)
);
CREATE TABLE IF NOT EXISTS legacy_link (
  document_id uuid PRIMARY KEY REFERENCES legacy_document(id), mail_key uuid NOT NULL REFERENCES mail_identity(id),
  proof jsonb NOT NULL, linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_proposal (
  id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES report_version(run_id),
  namespace text NOT NULL, target_path text NOT NULL, base_hash text NOT NULL, report_hash text NOT NULL,
  addition text NOT NULL, next_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applying','applied')),
  owner_hash text, created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz,
  UNIQUE(run_id,namespace,target_path,base_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_knowledge_writer ON knowledge_proposal(namespace,target_path) WHERE status='applying';

-- Display-only conversation links. Never merge mail_identity or analysis history.
CREATE TABLE IF NOT EXISTS manual_thread_link (
  id uuid PRIMARY KEY, store_id text NOT NULL,
  source_id bigint NOT NULL CHECK(source_id>0), source_message_id text,
  source_fetched_at text NOT NULL, source_subject text NOT NULL,
  target_id bigint NOT NULL CHECK(target_id>0), target_message_id text,
  target_fetched_at text NOT NULL, target_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(source_id<target_id), UNIQUE(store_id,source_id,target_id)
);
