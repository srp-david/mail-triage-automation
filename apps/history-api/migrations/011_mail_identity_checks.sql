-- Cache verification outcomes only; never store mail bodies or endpoint credentials.
CREATE TABLE mail_identity_check (
 source_id uuid NOT NULL REFERENCES source(id),
 user_id uuid NOT NULL REFERENCES app_user(id),
 scope_hash text NOT NULL CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 mail_id bigint NOT NULL CHECK(mail_id > 0),
 matched boolean NOT NULL,
 verified_at timestamptz NOT NULL,
 PRIMARY KEY(source_id,user_id,scope_hash,mail_id)
);
CREATE INDEX sync_identity_check_source ON v1_sync(source_id,id);
CREATE INDEX sync_identity_check_finished ON v1_sync_batch(sync_id,finished_at DESC) WHERE finished_at IS NOT NULL;
