-- Preserve team/source UUIDs and existing credentials. No account is created here.
-- Stop rather than silently move accounts or their evidence across existing teams.
DO $$
DECLARE target uuid; team_count integer;
BEGIN
  SELECT count(DISTINCT m.team_id), (array_agg(DISTINCT m.team_id))[1]
    INTO team_count,target FROM membership m JOIN app_user u ON u.id=m.user_id
    WHERE u.username IN ('srp-tom','david','sara') AND m.active;
  IF team_count>1 THEN RAISE EXCEPTION 'DEVELOPMENT_TEAM_MAPPING_REQUIRES_REVIEW'; END IF;
  IF target IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM team WHERE name='개발1팀' AND id<>target) THEN
      RAISE EXCEPTION 'DEVELOPMENT_TEAM_NAME_CONFLICT';
    END IF;
    UPDATE team SET name='개발1팀' WHERE id=target;
  END IF;
END $$;
CREATE INDEX analysis_status_created ON analysis_run(status,created_at DESC,id DESC);
CREATE INDEX source_team_history ON source(team_id,store_id) WHERE active;
