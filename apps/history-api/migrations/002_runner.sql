ALTER TABLE analysis_run DROP CONSTRAINT analysis_run_status_check;
ALTER TABLE analysis_run ADD CONSTRAINT analysis_run_status_check CHECK(status IN ('queued','running','completed','needs_input','failed','cancelled'));
CREATE TABLE v1_run (
 run_id uuid PRIMARY KEY REFERENCES analysis_run(id),source_id uuid NOT NULL REFERENCES source(id),
 requested_by uuid NOT NULL REFERENCES app_user(id), target_runner_id uuid NOT NULL REFERENCES runner(id),
 agent text NOT NULL CHECK(agent IN ('codex','claude')), executor_kind text NOT NULL CHECK(executor_kind='local'),
 verified_at timestamptz NOT NULL, verified_by uuid NOT NULL REFERENCES runner(id),
 generation integer NOT NULL DEFAULT 0, claim_request_id uuid UNIQUE,
 result_request_id uuid UNIQUE, result_hash text, cancel_requested_at timestamptz,
 contract_version text NOT NULL DEFAULT '1', skill_version text, model text
);
CREATE INDEX v1_runner_queue ON v1_run(target_runner_id);
