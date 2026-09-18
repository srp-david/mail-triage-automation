CREATE TABLE v1_sync (
 id uuid PRIMARY KEY REFERENCES sync_run(id), source_id uuid NOT NULL REFERENCES source(id), runner_id uuid NOT NULL REFERENCES runner(id),
 requested_by uuid NOT NULL REFERENCES app_user(id), request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL,
 owner_hash text, generation integer NOT NULL DEFAULT 0, claim_request_id uuid UNIQUE, lease_until timestamptz,
 stop_requested boolean NOT NULL DEFAULT false
);
CREATE TABLE v1_sync_batch (
 id uuid PRIMARY KEY, sync_id uuid NOT NULL REFERENCES v1_sync(id), result jsonb,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
