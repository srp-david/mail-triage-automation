CREATE TABLE report_question_job (
 id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES report_version(run_id),
 requested_by uuid NOT NULL REFERENCES app_user(id), runner_id uuid NOT NULL REFERENCES runner(id),
 agent text NOT NULL CHECK(agent IN ('codex','claude')), allow_evidence boolean NOT NULL,
 request_hash text NOT NULL, context jsonb NOT NULL, question text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','failed')), result_hash text,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE UNIQUE INDEX one_report_question_per_runner ON report_question_job(runner_id) WHERE status='running';
