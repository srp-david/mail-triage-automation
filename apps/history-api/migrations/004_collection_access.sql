CREATE TABLE legacy_collection_access (
 collection_id uuid NOT NULL REFERENCES legacy_collection(id),
 user_id uuid NOT NULL REFERENCES app_user(id),
 can_write boolean NOT NULL DEFAULT false,
 PRIMARY KEY(collection_id,user_id)
);
