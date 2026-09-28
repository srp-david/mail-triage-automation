CREATE TABLE report_head (
 run_id uuid PRIMARY KEY REFERENCES report_version(run_id), version integer NOT NULL CHECK(version>0)
);
CREATE TABLE report_revision (
 run_id uuid NOT NULL REFERENCES report_version(run_id), version integer NOT NULL CHECK(version>0),
 report text NOT NULL, report_hash text NOT NULL, author_id uuid REFERENCES app_user(id),
 change_note text NOT NULL, evidence text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid UNIQUE, request_hash text, PRIMARY KEY(run_id,version)
);
CREATE TABLE report_message (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES report_version(run_id), author_id uuid NOT NULL REFERENCES app_user(id),
 kind text NOT NULL CHECK(kind IN ('question','note','decision','unresolved','reply_draft','answer')),
 body text NOT NULL, evidence text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL UNIQUE, request_hash text NOT NULL
);
CREATE INDEX report_message_order ON report_message(run_id,created_at,id);
-- Immutable records: application DB roles cannot rewrite history, including by accident.
CREATE FUNCTION reject_collaboration_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_COLLABORATION_RECORD'; END $$;
CREATE TRIGGER report_revision_immutable BEFORE UPDATE OR DELETE ON report_revision
 FOR EACH ROW EXECUTE FUNCTION reject_collaboration_mutation();
CREATE TRIGGER report_message_immutable BEFORE UPDATE OR DELETE ON report_message
 FOR EACH ROW EXECUTE FUNCTION reject_collaboration_mutation();
