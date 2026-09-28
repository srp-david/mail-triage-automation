-- Local mail identities stay source-scoped. Common identities never grant access.
CREATE TABLE common_mail (
 id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES team(id), fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(team_id,fingerprint)
);
CREATE TABLE common_mail_link (
 mail_key uuid PRIMARY KEY REFERENCES mail_identity(id), common_id uuid NOT NULL REFERENCES common_mail(id),
 verified_by uuid NOT NULL REFERENCES app_user(id), verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX common_mail_members ON common_mail_link(common_id);
ALTER TABLE analysis_run ADD COLUMN common_mail_id uuid REFERENCES common_mail(id);
CREATE UNIQUE INDEX one_active_common_mail ON analysis_run(common_mail_id)
 WHERE common_mail_id IS NOT NULL AND status IN ('queued','running');
CREATE TABLE report_share (
 run_id uuid PRIMARY KEY REFERENCES report_version(run_id), team_id uuid NOT NULL REFERENCES team(id),
 permission text NOT NULL CHECK(permission IN ('read','write')), published_by uuid NOT NULL REFERENCES app_user(id),
 published_at timestamptz NOT NULL DEFAULT now()
);
