import { Field, SelectField, Panel, Disclosure, DisclosureTitle } from '../components/Controls';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '../forms/Form';
import { settingsSchema } from '../forms/schemas';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, errorText } from '../api/client';
import { Action } from '../components/Common';
import { Registration, SetupStep } from './SetupControls';
interface SourceOption {
  id: string;
  display_name: string;
}
interface CollectionOption {
  id: string;
  name: string;
}
interface RunnerOption extends SourceOption {
  active: boolean;
  agents: string[];
}
interface MemberOption {
  id: string;
  display_name?: string;
  username?: string;
  email?: string;
}
interface LocalEnvironment {
  mailConfigured: boolean;
  agents: ('codex' | 'claude')[];
  evidenceRootCount: number;
  dbConfigured: boolean;
}
interface LocalSettings {
  sourceId: string;
  agent: 'codex' | 'claude';
  collectionId?: string;
  runnerId?: string;
  originalAvailable?: boolean;
  environment?: LocalEnvironment;
}
interface RuntimeStatus {
  analysis: string;
  sync: string;
  analysisAvailable: boolean;
}
interface RecoveryStatus {
  analysis?: { state: string; hasResult?: boolean } | null;
  sync?: { state: string } | null;
}
interface ReconnectPreview {
  matchedMails: number;
  ticket: string;
}
const stateLabel = (state?: string) =>
  ({
    stopped: '중지됨',
    running: '실행 중',
    idle: '대기 중',
    working: '처리 중',
    retrying: '연결 재시도 중',
    stopping: '중지 중',
    recovery_required: '복구 필요',
  })[state ?? ''] ?? '확인 필요';
const loopActive = (state?: string) => ['idle', 'working', 'retrying'].includes(state ?? '');

export function Settings({ changed }: { changed: () => Promise<void> }) {
  const { api, notice } = useSession();
  const [sources, setSources] = useState<SourceOption[]>([]),
    [collections, setCollections] = useState<CollectionOption[]>([]),
    [runners, setRunners] = useState<RunnerOption[]>([]),
    [members, setMembers] = useState<MemberOption[]>([]),
    [member, setMember] = useState('');
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { sourceId: '', agent: 'codex' },
  });
  const value = form.watch(),
    { reset } = form;
  const [originalAvailable, setOriginalAvailable] = useState(false),
    [environment, setEnvironment] = useState<LocalEnvironment>();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null),
    [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectPreview | null>(null),
    [sameStore, setSameStore] = useState(false);
  const [tab, setTab] = useState(0),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [runtimeError, setRuntimeError] = useState('');
  const revision = useRef(0);
  const invalidate = () => {
    revision.current++;
    setRuntime(null);
    setRuntimeError('');
    setRecovery(null);
    setReconnect(null);
    setSameStore(false);
  };
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setRuntimeError('');
    setRuntime(null);
    setRecovery(null);
    setReconnect(null);
    setSameStore(false);
    revision.current++;
    try {
      const [s, c, r, m, v] = await Promise.all([
        api<SourceOption[]>('/sources'),
        api<CollectionOption[]>('/collections'),
        api<RunnerOption[]>('/runners'),
        api<MemberOption[]>('/members'),
        api<LocalSettings>('/settings'),
      ]);
      setSources(s);
      setCollections(c);
      setRunners(r);
      setMembers(m);
      reset({
        sourceId: v.sourceId,
        agent: v.agent,
        collectionId: v.collectionId,
        runnerId: v.runnerId,
      });
      setOriginalAvailable(!!v.originalAvailable);
      setEnvironment(v.environment);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [api, reset]);
  useEffect(() => {
    void load();
    const currentRevision = revision;
    return () => {
      currentRevision.current++;
    };
  }, [load]);
  const savedSelection =
    !loading && !loadError && !form.formState.isDirty && !form.formState.isSubmitting;
  const mailBound = savedSelection && originalAvailable;
  const agentConfigured = environment?.agents.includes(value.agent);
  const runnerSelected = runners.some(
    (r) => r.id === value.runnerId && r.active && r.agents.includes(value.agent),
  );
  const canStart = savedSelection && mailBound && runnerSelected;
  const next = !value.sourceId
    ? '메일 출처를 선택하거나 이 PC의 메일을 새로 등록하세요.'
    : !runnerSelected
      ? 'AI 도구를 선택하고 이 PC의 실행 장치를 등록하거나 선택하세요.'
      : !savedSelection
        ? '선택한 연결을 저장한 다음 실행 상태를 확인하세요.'
        : !originalAvailable
          ? '이 출처의 원본이 이 PC에 없습니다. 공유 보고서를 보거나 기존 원본을 다시 연결하세요.'
          : agentConfigured === false
            ? '선택한 AI 도구의 실행 경로를 설정한 뒤 앱을 다시 시작하세요.'
            : !runtime
              ? '실행 상태를 확인한 다음 분석 실행을 켜세요.'
              : !runtime.analysisAvailable
                ? '개인 AI 도구의 실행 경로를 설정한 뒤 앱을 다시 시작하세요.'
                : loopActive(runtime.analysis)
                  ? '메일함에서 분석할 메일을 선택하세요.'
                  : '분석 실행을 켠 다음 메일함에서 분석을 시작하세요.';
  const refreshRuntime = async () => {
    const version = revision.current;
    setRuntime(null);
    setRuntimeError('');
    try {
      const result = await api<RuntimeStatus>('/runtime');
      if (version === revision.current) setRuntime(result);
    } catch (e) {
      if (version === revision.current) setRuntimeError(errorText(e));
    }
  };
  return (
    <Panel className="settings-shell">
      <Box className="setup-header">
        <Box>
          <Typography variant="overline" color="primary">
            MY WORKSPACE
          </Typography>
          <Typography component="h2" variant="h2">
            출처와 실행 설정
          </Typography>
          <Typography color="text.secondary">
            내 PC의 메일과 AI 도구를 연결하고 분석을 준비하세요.
          </Typography>
        </Box>
        <Chip label="이 PC의 개인 실행 환경" variant="outlined" />
      </Box>
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        aria-label="설정 영역"
        variant="scrollable"
        scrollButtons="auto"
        className="setup-tabs"
      >
        {['개인 연결', '공유·장치 관리', '중단 작업 복구'].map((label, i) => (
          <Tab
            key={label}
            label={label}
            id={`settings-tab-${i}`}
            aria-controls={`settings-panel-${i}`}
          />
        ))}
      </Tabs>
      {loading && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} role="status">
          <CircularProgress size={18} /> <span>연결 설정을 불러오는 중입니다.</span>
        </Stack>
      )}
      {loadError && (
        <Alert
          severity="error"
          action={
            <Action onAction={load} variant="text">
              다시 불러오기
            </Action>
          }
        >
          연결 설정을 불러오지 못했습니다. {loadError}
        </Alert>
      )}
      <fieldset
        className="setup-fieldset"
        disabled={loading || !!loadError || form.formState.isSubmitting}
      >
        <Box
          role="tabpanel"
          id="settings-panel-0"
          aria-labelledby="settings-tab-0"
          hidden={tab !== 0}
        >
          <Box className="setup-next" role="status">
            <Typography variant="body2" sx={{ fontWeight: 700 }} color="primary">
              다음 할 일
            </Typography>
            <Typography>{next}</Typography>
          </Box>
          <Box className="setup-grid">
            <SetupStep
              number={1}
              title="메일 연결"
              description="이 PC에서 사용할 메일 출처를 선택합니다."
              status={
                !savedSelection ? '선택 확인' : originalAvailable ? '원본 연결됨' : '연결 필요'
              }
              complete={mailBound}
            >
              <label>
                메일 출처
                <SelectField
                  aria-label="메일 출처"
                  value={value.sourceId}
                  onChange={(e) => {
                    invalidate();
                    form.setValue('sourceId', e.target.value, { shouldDirty: true });
                    form.setValue('runnerId', undefined, { shouldDirty: true });
                  }}
                >
                  <option value="">출처 선택</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name}
                    </option>
                  ))}
                </SelectField>
              </label>
              {form.formState.errors.sourceId && (
                <Alert severity="error">{form.formState.errors.sourceId.message}</Alert>
              )}
              <Typography variant="body2" color="text.secondary">
                {mailBound
                  ? '이 PC의 원본 저장소가 연결되어 있습니다. 실제 통신은 메일함에서 확인하세요.'
                  : '원본이 없는 출처도 공유 보고서는 조회할 수 있습니다.'}
              </Typography>
              <Disclosure>
                <DisclosureTitle>처음 연결하는 메일 등록</DisclosureTitle>
                <Typography variant="body2">
                  Mail MCP를 실행한 후 알아보기 쉬운 이름으로 등록하세요. 기존 출처의 복원은 아래
                  다시 연결을 사용하세요.
                </Typography>
                {environment?.mailConfigured === false && (
                  <Alert severity="info">
                    아래 연결 설정 안내에 따라 Mail MCP 주소를 먼저 설정하세요.
                  </Alert>
                )}
                <Registration
                  label="메일 출처 이름"
                  placeholder="예: 내 업무 메일"
                  button="현재 MCP 출처 등록"
                  disabled={environment?.mailConfigured === false}
                  onRegister={async (name) => {
                    const created = await api<{ id: string }>('/sources', { displayName: name });
                    setSources(await api<SourceOption[]>('/sources'));
                    invalidate();
                    form.setValue('sourceId', created.id, { shouldDirty: true });
                    form.setValue('runnerId', undefined, { shouldDirty: true });
                    notice('메일 출처를 등록했습니다. AI 도구와 실행 장치를 선택하세요.');
                  }}
                />
              </Disclosure>
              <Disclosure>
                <DisclosureTitle>기존 원본 저장소 다시 연결</DisclosureTitle>
                <p>
                  같은 MCP 저장소의 복원본이거나 같은 저장소를 공유하는 PC에서만 사용하세요. 새
                  저장소는 새 출처로 등록해야 합니다. 이력의 최대 10개 메일을 대조하며 일부
                  일치만으로 저장소 전체가 같다고 보장하지 않습니다.
                </p>
                <Action
                  disabled={!savedSelection || !value.sourceId}
                  onAction={async () => {
                    setSameStore(false);
                    setRuntime(null);
                    setReconnect(
                      await api('/settings/reconnect/preview', { sourceId: value.sourceId }),
                    );
                  }}
                >
                  기존 이력과 원본 대조
                </Action>
                {reconnect && (
                  <>
                    <p>메일 {reconnect.matchedMails}개의 번호·Message-ID·제목이 일치했습니다.</p>
                    <label>
                      <Field
                        type="checkbox"
                        checked={sameStore}
                        onChange={(e) => setSameStore(e.target.checked)}
                      />
                      이 PC의 MCP가 기존과 같은 저장소 또는 그 복원본임을 확인했습니다.
                    </label>
                    <Action
                      disabled={!sameStore || !savedSelection}
                      onAction={async () => {
                        await api('/settings/reconnect/apply', {
                          ticket: reconnect.ticket,
                          confirmedSameStore: true,
                        });
                        setReconnect(null);
                        await load();
                        await changed();
                        notice('기존 출처의 원본 연결을 복구했습니다.');
                      }}
                    >
                      원본 연결 복구
                    </Action>
                  </>
                )}
              </Disclosure>
            </SetupStep>
            <SetupStep
              number={2}
              title="AI 도구와 실행 장치"
              description="분석에 사용할 도구와 이 PC를 연결합니다."
              status={
                agentConfigured === undefined
                  ? '설정 확인 필요'
                  : agentConfigured
                    ? '도구 설정됨'
                    : '도구 설정 필요'
              }
            >
              <Box className="setup-fields">
                <label>
                  분석 도구
                  <SelectField
                    aria-label="분석 도구"
                    value={value.agent}
                    onChange={(e) => {
                      invalidate();
                      form.setValue('agent', e.target.value as 'codex' | 'claude', {
                        shouldDirty: true,
                      });
                      form.setValue('runnerId', undefined, { shouldDirty: true });
                    }}
                  >
                    <option value="codex">Codex</option>
                    <option value="claude">Claude Code</option>
                  </SelectField>
                </label>
                <label>
                  실행 장치
                  <SelectField
                    aria-label="실행 장치"
                    value={value.runnerId ?? ''}
                    onChange={(e) => {
                      invalidate();
                      form.setValue('runnerId', e.target.value || undefined, { shouldDirty: true });
                    }}
                  >
                    <option value="">선택 안 함</option>
                    {runners
                      .filter((r) => r.active && r.agents.includes(value.agent))
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.display_name}
                        </option>
                      ))}
                  </SelectField>
                </label>
              </Box>
              <Typography variant="body2" color="text.secondary">
                도구의 설치·로그인을 마친 뒤 이 PC에서 등록한 장치를 선택하세요. 도구 설정 여부는
                실제 AI 응답 성공과 다릅니다.
              </Typography>
              <Disclosure>
                <DisclosureTitle>이 PC를 실행 장치로 등록</DisclosureTitle>
                {!value.sourceId && (
                  <Typography variant="body2">1단계에서 메일 출처를 먼저 선택하세요.</Typography>
                )}
                <Registration
                  label="실행 장치 이름"
                  placeholder="예: 내 업무 PC"
                  button="이 PC 실행 장치 등록"
                  disabled={!value.sourceId}
                  onRegister={async (name) => {
                    const created = await api<{ id: string }>('/runners', {
                      displayName: name,
                      agents: [value.agent],
                      sourceIds: [value.sourceId],
                    });
                    setRunners(await api<RunnerOption[]>('/runners'));
                    invalidate();
                    form.setValue('runnerId', created.id, { shouldDirty: true });
                    notice('실행 장치를 등록했습니다. 선택 저장 후 실행 상태를 확인하세요.');
                  }}
                />
              </Disclosure>
            </SetupStep>
            <SetupStep
              number={3}
              title="ERP 읽기 자료"
              description="분석에 필요한 코드와 참고 자료를 준비합니다."
              status={
                environment
                  ? environment.evidenceRootCount
                    ? '자료 설정됨'
                    : '자료 설정 필요'
                  : '설정 확인 필요'
              }
            >
              <Typography variant="body2">
                {environment
                  ? `읽기 자료 ${environment.evidenceRootCount}곳이 설정되어 있습니다.`
                  : '이 앱 버전에서는 읽기 자료 설정을 표시하지 않습니다. 연결 설정 안내에서 확인하세요.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                지정한 폴더의 자료만 읽습니다. 경로를 설정한 뒤 지정 업무로 필요한 자료를 읽을 수
                있는지 확인하세요.
              </Typography>
              <Box className="setup-note">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  ERP DB 조회
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {environment?.dbConfigured
                    ? '조회 연결이 설정되어 있습니다. 실제 조회는 별도로 확인하세요.'
                    : '현재 앱의 실제 ERP DB 조회 연결은 별도 준비가 필요합니다.'}
                </Typography>
              </Box>
            </SetupStep>
            <SetupStep
              number={4}
              title="저장하고 분석 준비"
              description="설정을 저장한 뒤 필요한 실행을 켭니다."
              status={runtime && savedSelection ? stateLabel(runtime.analysis) : '상태 확인 전'}
              complete={savedSelection && loopActive(runtime?.analysis)}
            >
              <Form
                aria-label="연결 선택 저장"
                onSubmit={form.handleSubmit(async (values) => {
                  invalidate();
                  try {
                    await api('/settings', values);
                    await load();
                    await changed();
                    notice('출처와 실행 설정을 저장했습니다.');
                  } catch (e) {
                    notice(errorText(e));
                  }
                })}
              >
                <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
                  선택 저장
                </Button>
                <Action
                  variant="outlined"
                  disabled={!savedSelection || !value.sourceId}
                  onAction={refreshRuntime}
                >
                  실행 상태 확인
                </Action>
              </Form>
              <Typography variant="body2" color="text.secondary">
                {form.formState.isDirty
                  ? '저장하지 않은 변경이 있습니다. 먼저 선택을 저장하세요.'
                  : '설정을 저장하거나 로그아웃하면 실행이 중지됩니다.'}
              </Typography>
              {runtimeError && (
                <Alert severity="error">실행 상태를 확인하지 못했습니다. {runtimeError}</Alert>
              )}
              {runtime && savedSelection && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                  <Chip label={`분석: ${stateLabel(runtime.analysis)}`} />
                  <Chip label={`동기화: ${stateLabel(runtime.sync)}`} />
                </Stack>
              )}
              {runtime && !runtime.analysisAvailable && (
                <Alert severity="info">
                  로컬 설정에 개인 분석 도구가 등록되지 않았습니다. 연결 설정 안내를 확인하세요.
                </Alert>
              )}
              <Box className="setup-actions">
                <Action
                  disabled={
                    !canStart ||
                    !runtime?.analysisAvailable ||
                    agentConfigured === false ||
                    loopActive(runtime.analysis)
                  }
                  onAction={async () => {
                    await api('/runtime/start', { kind: 'analysis' });
                    await refreshRuntime();
                    notice('분석 실행을 켰습니다. 메일함에서 분석할 메일을 선택하세요.');
                  }}
                >
                  분석 실행 켜기
                </Action>
                <Action
                  variant="outlined"
                  disabled={!canStart || !runtime || loopActive(runtime.sync)}
                  onAction={async () => {
                    await api('/runtime/start', { kind: 'sync' });
                    await refreshRuntime();
                    notice('동기화 실행을 켰습니다. 메일함에서 동기화를 시작하세요.');
                  }}
                >
                  동기화 실행 켜기
                </Action>
                <Button
                  href="#mailbox"
                  variant="text"
                  disabled={!savedSelection || !value.sourceId}
                >
                  메일함으로 이동
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary">
                이 앱이 켜져 있는 동안 실행됩니다. 실제 분석은 메일함에서 요청합니다.
              </Typography>
              <Action
                variant="text"
                onAction={async () => {
                  await api('/runtime/stop', {});
                  await refreshRuntime();
                }}
              >
                로컬 실행 중지
              </Action>
            </SetupStep>
          </Box>
          <Disclosure className="setup-guide">
            <DisclosureTitle>연결 설정 안내 · MCP 주소와 AI 실행 경로</DisclosureTitle>
            <Typography variant="body2">
              현재 연결 주소와 실행 경로는 설치 폴더의 config/settings.json에서 설정합니다. 기존
              값을 유지하면서 필요한 항목을 수정하고 앱을 다시 시작하세요.
            </Typography>
            <ol className="setup-guide-list">
              <li>
                <strong>메일</strong> — Mail MCP를 켜고 mailMcpUrl에 해당 연결 주소를 설정합니다.
              </li>
              <li>
                <strong>AI 도구</strong> — Codex 또는 Claude Code의 설치·로그인을 마치고 agents의
                해당 도구에 executable을 설정합니다.
              </li>
              <li>
                <strong>ERP 자료</strong> — evidenceRoots에 읽기를 허용할 코드·자료 폴더를
                설정합니다.
              </li>
              <li>
                <strong>다시 확인</strong> — 앱을 다시 시작하고 메일 출처·장치를 선택한 뒤
                저장합니다.
              </li>
            </ol>
            <Typography variant="body2" color="text.secondary">
              연결 상태가 표시되어도 실제 메일 통신·AI 응답·업무 자료 확인은 별도로 필요합니다.
            </Typography>
          </Disclosure>
        </Box>
        <Box
          role="tabpanel"
          id="settings-panel-1"
          aria-labelledby="settings-tab-1"
          hidden={tab !== 1}
          className="setup-management"
        >
          <Alert severity="info">
            공유는 현재 저장한 출처와 문서 모음에 적용됩니다. 개인 연결을 변경했다면 먼저
            저장하세요.
          </Alert>
          <Typography component="h3" variant="h3">
            이전 문서 모음
          </Typography>
          <label>
            이전 문서 모음
            <SelectField
              aria-label="이전 문서 모음"
              value={value.collectionId ?? ''}
              onChange={(e) => {
                invalidate();
                form.setValue('collectionId', e.target.value || undefined, { shouldDirty: true });
              }}
            >
              <option value="">선택 안 함</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </label>
          <Registration
            label="문서 모음 이름"
            placeholder="예: 팀 참고 문서"
            button="문서 모음 만들기"
            onRegister={async (name) => {
              await api('/collections', { name, requestId: crypto.randomUUID() });
              setCollections(await api<CollectionOption[]>('/collections'));
              notice('문서 모음을 만들었습니다. 사용할 모음을 선택하세요.');
            }}
          />
          {form.formState.isDirty && (
            <Alert
              severity="warning"
              action={<Button onClick={() => setTab(0)}>개인 연결로 이동</Button>}
            >
              변경한 선택을 개인 연결에서 저장하세요.
            </Alert>
          )}
          <Typography component="h3" variant="h3">
            공유 관리
          </Typography>
          <label>
            팀 사용자{' '}
            <SelectField
              aria-label="팀 사용자"
              value={member}
              onChange={(e) => setMember(e.target.value)}
            >
              <option value="">사용자 선택</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name
                    ? `${m.display_name} (${m.username ?? m.email})`
                    : (m.username ?? m.email)}
                </option>
              ))}
            </SelectField>
          </label>
          {(['sources', 'collections'] as const).map((kind) => (
            <div key={kind}>
              <span>{kind === 'sources' ? '선택 출처' : '선택 문서 모음'}</span>
              {(['read', 'write', 'none'] as const).map((permission) => (
                <Action
                  key={permission}
                  disabled={
                    !savedSelection ||
                    !member ||
                    !(kind === 'sources' ? value.sourceId : value.collectionId)
                  }
                  onAction={async () => {
                    await api(
                      '/' +
                        kind +
                        '/' +
                        (kind === 'sources' ? value.sourceId : value.collectionId) +
                        '/grants',
                      { userId: member, permission },
                    );
                    notice('공유 권한을 변경했습니다.');
                  }}
                >
                  {permission === 'read'
                    ? '읽기 허용'
                    : permission === 'write'
                      ? '쓰기 허용'
                      : '권한 회수'}
                </Action>
              ))}
            </div>
          ))}
          <Typography component="h3" variant="h3">
            등록 장치
          </Typography>
          {runners.map((r) => (
            <div key={r.id}>
              {r.display_name} · {r.active ? '등록됨' : '폐기됨'}
              {r.active && (
                <Action
                  disabled={!savedSelection}
                  onAction={async () => {
                    await api('/runners/' + r.id + '/revoke', {});
                    await load();
                    await changed();
                  }}
                >
                  장치 폐기
                </Action>
              )}
            </div>
          ))}
        </Box>
        <Box
          role="tabpanel"
          id="settings-panel-2"
          aria-labelledby="settings-tab-2"
          hidden={tab !== 2}
          className="setup-management"
        >
          <Typography component="h3" variant="h3">
            중단·미전송 작업 복구
          </Typography>
          <Typography color="text.secondary">
            저장한 실행 장치의 기록을 확인한 뒤 필요한 작업만 복구하세요.
          </Typography>
          {!savedSelection && (
            <Alert severity="info">개인 연결의 변경 사항을 먼저 저장하세요.</Alert>
          )}
          <Action
            disabled={!savedSelection || !value.runnerId}
            onAction={async () => {
              setRecovery(await api('/runtime/recovery'));
            }}
          >
            미전송·중단 작업 확인
          </Action>
          {recovery && savedSelection && (
            <div>
              <p>
                분석: {recovery.analysis?.state ?? '기록 없음'} · 동기화:{' '}
                {recovery.sync?.state ?? '기록 없음'}
              </p>
              {recovery.analysis?.state === 'outbox' && (
                <Action
                  onAction={async () => {
                    await api('/runtime/recovery', { action: 'deliver' });
                    setRecovery(await api('/runtime/recovery'));
                  }}
                >
                  동일 결과 재전송
                </Action>
              )}
              {recovery.analysis?.hasResult && (
                <>
                  <p>
                    만료된 실행은 원본을 재확인한 뒤 새 이력으로 복구합니다. 기존 이력은 보존됩니다.
                  </p>
                  <Action
                    onAction={async () => {
                      await api('/runtime/recovery', { action: 'recover' });
                      setRecovery(await api('/runtime/recovery'));
                    }}
                  >
                    원본 재확인 후 결과 복구
                  </Action>
                </>
              )}
              {['running', 'interrupted'].includes(recovery.analysis?.state ?? '') &&
                !recovery.analysis?.hasResult && (
                  <Action
                    onAction={async () => {
                      await api('/runtime/recovery', { action: 'archive-analysis' });
                      setRecovery(await api('/runtime/recovery'));
                    }}
                  >
                    종료된 분석 중단 기록 보관
                  </Action>
                )}
              {recovery.sync?.state === 'running' && (
                <>
                  <Action
                    onAction={async () => {
                      await api('/runtime/recovery', { action: 'deliver-sync' });
                      setRecovery(await api('/runtime/recovery'));
                    }}
                  >
                    저장된 동기화 응답 재전송
                  </Action>
                  <Action
                    onAction={async () => {
                      await api('/runtime/recovery', { action: 'archive-sync' });
                      setRecovery(await api('/runtime/recovery'));
                    }}
                  >
                    종료된 동기화 기록 보관
                  </Action>
                </>
              )}
            </div>
          )}
        </Box>
      </fieldset>
    </Panel>
  );
}
