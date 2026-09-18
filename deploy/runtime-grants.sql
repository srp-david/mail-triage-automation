-- Execute as migration owner after numbered migrations. Create the LOGIN role
-- and password separately via the operator's secret provisioning procedure.
GRANT CONNECT ON DATABASE triage TO triage_runtime;
GRANT USAGE ON SCHEMA public TO triage_runtime;
GRANT SELECT ON schema_migration TO triage_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON team,app_user,membership,source,source_access,runner,runner_source,audit_event,
 mail_identity,analysis_run,report_version,review,sync_run,v1_run,v1_sync,v1_sync_batch,
 legacy_collection,legacy_collection_access,legacy_collection_document,legacy_document,legacy_link,related_mail,knowledge_proposal,manual_thread_link TO triage_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO triage_runtime;
