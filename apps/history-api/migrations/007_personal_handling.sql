CREATE TABLE personal_mail_handling (
 mail_key uuid NOT NULL REFERENCES mail_identity(id), user_id uuid NOT NULL REFERENCES app_user(id),
 handled_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(mail_key,user_id)
);
-- Existing completion belongs to the mapped source owner; never mark teammates done.
INSERT INTO personal_mail_handling(mail_key,user_id,handled_at)
 SELECT m.id,s.owner_user_id,m.handled_at FROM mail_identity m JOIN source s ON s.store_id=m.store_id
 WHERE m.handled_at IS NOT NULL ON CONFLICT DO NOTHING;
