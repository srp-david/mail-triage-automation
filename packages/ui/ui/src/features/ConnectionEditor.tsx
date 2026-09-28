import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { Field, TextArea, SelectField, Disclosure, DisclosureTitle } from '../components/Controls';
import { useSession, errorText } from '../api/client';
import { AgentEnvironment, wslError, type AgentCommand } from './AgentEnvironment';

type Command = AgentCommand;
type Connections = {
  mailMcpUrl?: string;
  dbMcpUrl?: string;
  agents: { codex?: Command; claude?: Command };
  evidenceRoots: Record<string, string | { path: string; files?: string[] }>;
};
type Snapshot = { revision: string; connections: Connections };
type Discovery = {
  mail: { url: string; source: string }[];
  db: { url: string; source: string }[];
  agents: Connections['agents'];
  note: string;
};
type Root = { name: string; path: string; files?: string[] };
const empty: Connections = { agents: {}, evidenceRoots: {} };

export function ConnectionEditor({ onSaved }: { onSaved: () => Promise<void> }) {
  const { api, notice } = useSession();
  const [value, setValue] = useState<Connections>(empty);
  const [revision, setRevision] = useState('');
  const [roots, setRoots] = useState<Root[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [discovery, setDiscovery] = useState<Discovery>();
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [savedDraft, setSavedDraft] = useState('');
  const mounted = useRef(true);
  const apply = (snapshot: Snapshot) => {
    const nextRoots = Object.entries(snapshot.connections.evidenceRoots).map(([name, root]) => ({
      name,
      path: typeof root === 'string' ? root : root.path,
      ...(typeof root !== 'string' && root.files ? { files: root.files } : {}),
    }));
    setSavedDraft(JSON.stringify({ value: snapshot.connections, roots: nextRoots }));
    setValue(snapshot.connections);
    setRevision(snapshot.revision);
    setRoots(
      Object.entries(snapshot.connections.evidenceRoots).map(([name, root]) => ({
        name,
        path: typeof root === 'string' ? root : root.path,
        ...(typeof root !== 'string' && root.files ? { files: root.files } : {}),
      })),
    );
  };
  const fill = (result: Discovery) => {
    setDiscovery(result);
    setValue((previous) => ({
      ...previous,
      mailMcpUrl: previous.mailMcpUrl || (result.mail.length === 1 ? result.mail[0].url : ''),
      dbMcpUrl: previous.dbMcpUrl || (result.db.length === 1 ? result.db[0].url : ''),
      agents: {
        ...result.agents,
        ...Object.fromEntries(
          Object.entries(previous.agents).filter(
            ([, command]) => command?.executable || command?.wsl,
          ),
        ),
      },
    }));
  };
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await api<Snapshot>('/connections');
        if (cancelled) return;
        apply(snapshot);
        if (!snapshot.connections.mailMcpUrl || !snapshot.connections.dbMcpUrl) {
          const result = await api<Discovery>('/connections/discover', {});
          if (!cancelled) fill(result);
        }
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [api]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const setEndpoint = (kind: 'mail' | 'db', url: string) => {
    setValue((previous) => ({ ...previous, [kind === 'mail' ? 'mailMcpUrl' : 'dbMcpUrl']: url }));
    setChecks((previous) => ({ ...previous, [kind]: '' }));
  };
  const setCommand = (agent: 'codex' | 'claude', command: Command) => {
    setValue((previous) => ({ ...previous, agents: { ...previous.agents, [agent]: command } }));
    setChecks((previous) => ({ ...previous, [agent]: '' }));
  };
  const dirty = !!revision && JSON.stringify({ value, roots }) !== savedDraft;
  return (
    <Box component="section" aria-label="이 PC의 연결 환경" className="connection-editor">
      <Box className="connection-heading">
        <Box>
          <Typography variant="h3">연결 환경</Typography>
          <Typography variant="body2" color="text.secondary">
            이 PC의 메일과 분석 도구를 연결하세요. 등록된 연결은 자동으로 찾을 수 있습니다.
          </Typography>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          label={dirty ? '저장하지 않은 변경' : '저장된 설정'}
          color={dirty ? 'warning' : 'default'}
        />
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {busy && (
        <Box role="status">
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1 }}>
            연결 설정을 확인하고 있습니다.
          </Typography>
        </Box>
      )}
      <fieldset className="setup-fieldset" disabled={busy}>
        <Stack spacing={2}>
          <Box className="connection-discovery">
            <Box>
              <Typography sx={{ fontWeight: 700 }}>이미 등록한 연결 가져오기</Typography>
              <Typography variant="body2" color="text.secondary">
                Codex·Claude 설정에서 찾아 빈 항목에 채웁니다. 저장 전까지 적용되지 않습니다.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={() =>
                  void run(async () => {
                    fill(await api<Discovery>('/connections/discover', {}));
                    setChecks({});
                  })
                }
              >
                이 PC에서 자동 찾기
              </Button>
              <Button
                onClick={() =>
                  void run(async () => {
                    apply(await api<Snapshot>('/connections'));
                    setChecks({});
                  })
                }
              >
                저장된 연결 다시 불러오기
              </Button>
            </Stack>
          </Box>
          {discovery && (
            <Alert severity="info">
              메일 {discovery.mail.length}개 · DB {discovery.db.length}개 발견. 입력 내용을 확인한
              뒤 저장하세요.
              <Disclosure>
                <DisclosureTitle>자동 찾기 상세 안내</DisclosureTitle>
                <Typography variant="body2">
                  {discovery.note} 여러 개를 찾으면 사용할 연결을 선택하세요.
                </Typography>
              </Disclosure>
            </Alert>
          )}
          <Box className="connection-section-title">
            <Typography variant="h4">메일과 데이터베이스</Typography>
            <Typography variant="body2" color="text.secondary">
              메일 연결을 먼저 설정하고, 필요한 경우 DB를 연결하세요.
            </Typography>
          </Box>
          <Box className="connection-grid">
            {(['mail', 'db'] as const).map((kind) => {
              const label = kind === 'mail' ? 'Mail MCP' : 'DB MCP';
              const url = (kind === 'mail' ? value.mailMcpUrl : value.dbMcpUrl) ?? '';
              return (
                <Stack key={kind} spacing={1.5} className="connection-card">
                  <Box className="connection-card-title">
                    <Typography component="h5" variant="h4">
                      {label}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={url ? '주소 입력됨' : kind === 'mail' ? '설정 필요' : '선택 사항'}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {kind === 'mail'
                      ? '메일 목록과 원문을 가져오는 연결입니다.'
                      : 'ERP 데이터베이스의 테이블 구조를 확인합니다.'}
                  </Typography>
                  <Field
                    aria-label={`${label} 주소`}
                    value={url}
                    onChange={(e) => setEndpoint(kind, e.target.value)}
                    placeholder={
                      kind === 'mail' ? 'http://127.0.0.1:17082/mcp' : 'http://127.0.0.1:17080/mcp'
                    }
                  />
                  {!!discovery?.[kind].length && (
                    <SelectField
                      aria-label={`발견한 ${label} 연결`}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setEndpoint(kind, e.target.value);
                      }}
                    >
                      <option value="">발견한 연결에서 선택</option>
                      {discovery[kind].map((candidate) => (
                        <option key={candidate.url} value={candidate.url}>
                          {candidate.source} — {candidate.url}
                        </option>
                      ))}
                    </SelectField>
                  )}
                  <Button
                    variant="outlined"
                    disabled={!url}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{
                          connected: boolean;
                          compatible: boolean;
                          missing: string[];
                        }>('/connections/check', { kind, url });
                        setChecks((previous) => ({
                          ...previous,
                          [kind]: !result.connected
                            ? '연결하지 못했습니다. MCP 실행 상태와 주소를 확인하세요.'
                            : result.compatible
                              ? '연결 및 필요한 도구 확인 완료'
                              : `연결됐지만 필요한 도구가 없습니다: ${result.missing.join(', ')}`,
                        }));
                      })
                    }
                  >
                    {label} 연결 확인
                  </Button>
                  {checks[kind] && (
                    <Alert
                      severity={
                        checks[kind] === '연결 및 필요한 도구 확인 완료' ? 'success' : 'warning'
                      }
                      role="status"
                    >
                      {checks[kind]}
                    </Alert>
                  )}
                </Stack>
              );
            })}
          </Box>
          <Box className="connection-section-title">
            <Typography variant="h4">AI 분석 도구</Typography>
            <Typography variant="body2" color="text.secondary">
              사용할 도구만 설정하세요. 설치와 계정 로그인은 해당 도구에서 진행합니다.
            </Typography>
          </Box>
          <Box className="connection-grid">
            {(['codex', 'claude'] as const).map((agent) => {
              const label = agent === 'codex' ? 'Codex' : 'Claude Code';
              const command = value.agents[agent] ?? { executable: '' };
              return (
                <Stack key={agent} spacing={1.5} className="connection-card">
                  <Box className="connection-card-title">
                    <Typography component="h5" variant="h4">
                      {label}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={command.executable ? '경로 입력됨' : '미설정'}
                    />
                  </Box>
                  <AgentEnvironment
                    agent={agent}
                    command={command}
                    onChange={(next) => setCommand(agent, next)}
                  />
                  <Field
                    aria-label={`${label} 실행 경로`}
                    placeholder={command.wsl ? `/home/user/.local/bin/${agent}` : undefined}
                    value={command.executable}
                    onChange={(e) => setCommand(agent, { ...command, executable: e.target.value })}
                  />
                  <Disclosure>
                    <DisclosureTitle>{label} 실행 인수</DisclosureTitle>
                    <TextArea
                      aria-label={`${label} 실행 인수`}
                      value={(command.prefix ?? []).join('\n')}
                      onChange={(e) =>
                        setCommand(agent, { ...command, prefix: e.target.value.split('\n') })
                      }
                    />
                    <Typography variant="body2">
                      Node로 실행할 때 스크립트 경로 등 필요한 인수를 한 줄에 하나씩 입력하세요.
                    </Typography>
                  </Disclosure>
                  <Button
                    variant="outlined"
                    disabled={
                      !command.executable || (!!command.wsl && !command.wsl.distribution.trim())
                    }
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{
                          installed: boolean;
                          supported: boolean;
                          code?: string;
                        }>('/connections/agent-check', {
                          agent,
                          command: { ...command, prefix: command.prefix?.filter(Boolean) },
                        });
                        setChecks((previous) => ({
                          ...previous,
                          [agent]: result.installed
                            ? result.supported
                              ? '실행 및 호환성 확인 완료. 도구 로그인은 별도로 필요합니다.'
                              : '실행됐지만 필요한 기능을 지원하지 않습니다.'
                            : (wslError(result.code) ??
                              '실행하지 못했습니다. 설치와 경로를 확인하세요.'),
                        }));
                      })
                    }
                  >
                    {label} 실행 확인
                  </Button>
                  {checks[agent] && (
                    <Alert
                      severity={
                        checks[agent].startsWith('실행 및 호환성 확인 완료') ? 'success' : 'warning'
                      }
                      role="status"
                    >
                      {checks[agent]}
                    </Alert>
                  )}
                </Stack>
              );
            })}
          </Box>
          <Box className="connection-card">
            <Box className="connection-heading">
              <Box>
                <Typography variant="h4">읽기 자료 폴더</Typography>
                <Typography variant="body2" color="text.secondary">
                  분석에 참고할 ERP 코드와 문서 폴더를 추가하세요.
                </Typography>
              </Box>
              <Chip size="small" label={`${roots.length}개 폴더`} />
            </Box>
            {!roots.length && (
              <Typography className="connection-empty" variant="body2" color="text.secondary">
                등록된 폴더가 없습니다. 자료가 필요한 분석에 사용할 폴더를 추가하세요.
              </Typography>
            )}
            {roots.map((root, index) => (
              <Stack key={index} spacing={1.5} className="connection-root">
                <Box className="connection-root-fields">
                  <Field
                    aria-label={`자료 이름 ${index + 1}`}
                    value={root.name}
                    onChange={(e) =>
                      setRoots((items) =>
                        items.map((item, i) =>
                          i === index ? { ...item, name: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="erp"
                  />
                  <Field
                    aria-label={`자료 폴더 ${index + 1}`}
                    value={root.path}
                    onChange={(e) =>
                      setRoots((items) =>
                        items.map((item, i) =>
                          i === index ? { ...item, path: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="C:\work\erp"
                  />
                </Box>
                <Disclosure>
                  <DisclosureTitle>추가 허용 파일</DisclosureTitle>
                  <TextArea
                    aria-label={`추가 허용 파일 ${index + 1}`}
                    value={(root.files ?? []).join('\n')}
                    onChange={(e) =>
                      setRoots((items) =>
                        items.map((item, i) =>
                          i === index ? { ...item, files: e.target.value.split('\n') } : item,
                        ),
                      )
                    }
                  />
                  <Typography variant="body2">
                    기본 소스 확장자 이외의 파일은 폴더 기준 상대 경로를 한 줄에 하나씩 입력하세요.
                  </Typography>
                </Disclosure>
                <Button
                  color="error"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => setRoots((items) => items.filter((_, i) => i !== index))}
                >
                  자료 폴더 {index + 1} 삭제
                </Button>
              </Stack>
            ))}
            <Button
              variant="outlined"
              onClick={() => setRoots((items) => [...items, { name: '', path: '' }])}
            >
              자료 폴더 추가
            </Button>
            <Typography variant="body2">
              자료 이름은 영문 소문자로 시작하고 숫자·밑줄·하이픈을 사용할 수 있습니다. 지정한
              폴더만 읽습니다.
            </Typography>
          </Box>
          <Box className="connection-save">
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                {dirty ? '변경한 연결을 저장하세요' : '연결 설정이 저장되어 있습니다'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                저장 후 ‘분석 준비’에서 메일 출처와 실행 장치를 선택하세요.
              </Typography>
            </Box>
            <Button
              variant="contained"
              disabled={
                !revision ||
                !dirty ||
                Object.values(value.agents).some(
                  (command) => command?.wsl && !command.wsl.distribution.trim(),
                )
              }
              onClick={() =>
                void run(async () => {
                  if (new Set(roots.map((root) => root.name)).size !== roots.length)
                    throw new Error('자료 이름이 중복됩니다. 서로 다른 이름을 입력하세요.');
                  const connections: Connections = {
                    ...(value.mailMcpUrl?.trim() ? { mailMcpUrl: value.mailMcpUrl.trim() } : {}),
                    ...(value.dbMcpUrl?.trim() ? { dbMcpUrl: value.dbMcpUrl.trim() } : {}),
                    agents: Object.fromEntries(
                      Object.entries(value.agents)
                        .filter(([, command]) => command?.executable.trim())
                        .map(([agent, command]) => [
                          agent,
                          {
                            executable: command!.executable.trim(),
                            ...(command!.prefix ? { prefix: command!.prefix.filter(Boolean) } : {}),
                            ...(command!.wsl
                              ? {
                                  wsl: {
                                    distribution: command!.wsl.distribution.trim(),
                                    ...(command!.wsl.user?.trim()
                                      ? { user: command!.wsl.user.trim() }
                                      : {}),
                                  },
                                }
                              : {}),
                          },
                        ]),
                    ),
                    evidenceRoots: Object.fromEntries(
                      roots.map((root) => [
                        root.name,
                        root.files
                          ? { path: root.path, files: root.files.filter(Boolean) }
                          : root.path,
                      ]),
                    ),
                  };
                  apply(await api<Snapshot>('/connections', { revision, connections }));
                  setChecks({});
                  notice('연결 환경을 저장했습니다. 메일 출처와 장치를 확인한 뒤 실행을 켜세요.');
                  await onSaved();
                })
              }
            >
              연결 환경 저장
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary">
            저장하면 실행 대기를 중지하고 새 연결을 반영합니다. 분석·동기화 작업 중에는 작업이 끝난
            뒤 저장하세요. 메일 주소를 바꾸면 출처를 다시 연결해야 합니다.
          </Typography>
        </Stack>
      </fieldset>
    </Box>
  );
}
