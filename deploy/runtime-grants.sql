-- Execute as migration owner after numbered migrations. Create the LOGIN role
-- and password separately via the operator's secret provisioning procedure.
GRANT CONNECT ON DATABASE triage TO triage_runtime;
GRANT USAGE ON SCHEMA public TO triage_runtime;
GRANT SELECT ON schema_migration TO triage_runtime;
GRANT SELECT,INSERT,UPDATE ON user_credential,auth_session,refresh_token TO triage_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_throttle TO triage_runtime;
-- Revoke the earlier broad grants when applying this template to an existing role.
REVOKE UPDATE,DELETE ON audit_event,report_version,review,legacy_document FROM triage_runtime;
REVOKE DELETE ON analysis_run,v1_run,mail_identity,sync_run,v1_sync,v1_sync_batch FROM triage_runtime;
GRANT SELECT,INSERT ON audit_event,report_version,review,legacy_document TO triage_runtime;
GRANT SELECT,INSERT,UPDATE ON analysis_run,v1_run,mail_identity,sync_run,v1_sync,v1_sync_batch TO triage_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON team,app_user,membership,source,source_access,runner,runner_source,
 legacy_collection,legacy_collection_access,legacy_collection_document,legacy_link,related_mail,knowledge_proposal,manual_thread_link TO triage_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO triage_runtime;
