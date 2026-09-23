-- Operator only, after migrations in triage_private. Provision LOGIN credentials separately.
REVOKE ALL ON SCHEMA triage_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA triage_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA triage_private FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA triage_private FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA triage_private REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA triage_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA triage_private TO triage_runtime;
SET search_path TO triage_private;
GRANT SELECT ON schema_migration TO triage_runtime;
GRANT SELECT,INSERT ON audit_event,report_version,review,legacy_document TO triage_runtime;
GRANT SELECT,INSERT,UPDATE ON analysis_run,v1_run,mail_identity,sync_run,v1_sync,v1_sync_batch TO triage_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON team,app_user,membership,source,source_access,runner,runner_source,
 legacy_collection,legacy_collection_access,legacy_collection_document,legacy_link,related_mail,knowledge_proposal,manual_thread_link TO triage_runtime;
GRANT SELECT,INSERT,UPDATE ON user_credential,auth_session,refresh_token TO triage_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_throttle TO triage_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA triage_private TO triage_runtime;
RESET search_path;
