import { Field, SelectField, Panel, Disclosure, DisclosureTitle } from '../components/Controls';
import { Button, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form } from '../forms/Form';
import { settingsSchema, registrationSchema } from '../forms/schemas';
import { useCallback, useEffect, useState } from 'react';
import { useSession, errorText } from '../api/client';
import { Action } from '../components/Common';
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
interface LocalSettings {
  sourceId: string;
  agent: 'codex' | 'claude';
  collectionId?: string;
  runnerId?: string;
  originalAvailable?: boolean;
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
export function Settings({ changed }: { changed: () => Promise<void> }) {
  const { api, notice } = useSession(),
    [sources, setSources] = useState<SourceOption[]>([]),
    [collections, setCollections] = useState<CollectionOption[]>([]),
    [runners, setRunners] = useState<RunnerOption[]>([]),
    [members, setMembers] = useState<MemberOption[]>([]),
    [member, setMember] = useState('');
  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { sourceId: '', agent: 'codex' },
  });
  const registration = useForm<z.infer<typeof registrationSchema>>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { name: '' },
  });
  const value = form.watch();
  const { reset } = form;
  const [originalAvailable, setOriginalAvailable] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null),
    [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [reconnect, setReconnect] = useState<ReconnectPreview | null>(null),
    [sameStore, setSameStore] = useState(false);
  const load = useCallback(async () => {
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
  }, [api, reset]);
  useEffect(() => {
    void load().catch((e) => notice(errorText(e)));
  }, [load, notice]);
  return (
    <Panel>
      <Typography component="h2" variant="h2">
        출처와 실행 설정
      </Typography>
      <p>
        원본이 없는 출처도 공유 이력을 조회할 수 있습니다. 분석은 원본과 실행 장치가 연결된 출처에서
        시작하세요.
      </p>
      <Form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await api('/settings', values);
            await changed();
            notice('출처와 실행 설정을 저장했습니다.');
          } catch (error) {
            notice(errorText(error));
          }
        })}
      >
        <label>
          메일 출처{' '}
          <SelectField
            aria-label="메일 출처"
            value={value.sourceId}
            onChange={(e) => {
              form.setValue('sourceId', e.target.value, { shouldDirty: true });
              form.setValue('runnerId', undefined);
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
        <label>
          이전 문서 모음{' '}
          <SelectField
            aria-label="이전 문서 모음"
            value={value.collectionId ?? ''}
            onChange={(e) =>
              form.setValue('collectionId', e.target.value || undefined, { shouldDirty: true })
            }
          >
            <option value="">선택 안 함</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          분석 도구{' '}
          <SelectField
            aria-label="분석 도구"
            value={value.agent}
            onChange={(e) => {
              form.setValue('agent', e.target.value as 'codex' | 'claude', { shouldDirty: true });
              form.setValue('runnerId', undefined);
            }}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
          </SelectField>
        </label>
        <label>
          실행 장치{' '}
          <SelectField
            aria-label="실행 장치"
            value={value.runnerId ?? ''}
            onChange={(e) =>
              form.setValue('runnerId', e.target.value || undefined, { shouldDirty: true })
            }
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
        {form.formState.errors.sourceId && (
          <p role="alert">{form.formState.errors.sourceId.message}</p>
        )}
        <Button type="submit" variant="contained" disabled={form.formState.isSubmitting}>
          선택 저장
        </Button>
      </Form>
      <p>
        {originalAvailable
          ? '이 PC에 원본 연결이 있습니다.'
          : '선택된 출처의 원본이 이 PC에 연결되어 있지 않습니다.'}
      </p>
      <Disclosure>
        <DisclosureTitle>기존 원본 저장소 다시 연결</DisclosureTitle>
        <p>
          같은 MCP 저장소의 복원본이거나 같은 저장소를 공유하는 PC에서만 사용하세요. 새 저장소는 새
          출처로 등록해야 합니다. 이력의 최대 10개 메일을 대조하며 일부 일치만으로 저장소 전체가
          같다고 보장하지 않습니다.
        </p>
        <Action
          disabled={!value.sourceId}
          onAction={async () => {
            setSameStore(false);
            setReconnect(await api('/settings/reconnect/preview', { sourceId: value.sourceId }));
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
              disabled={!sameStore}
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
      <Typography component="h3" variant="h3">
        등록
      </Typography>
      <Field
        aria-label="등록 이름"
        {...registration.register('name')}
        maxLength={200}
        errorMessage={registration.formState.errors.name?.message}
        placeholder="출처·문서 모음·장치 이름"
      />
      <Action
        disabled={registration.formState.isSubmitting}
        onAction={registration.handleSubmit(async ({ name }) => {
          await api('/sources', { displayName: name });
          await load();
          notice('이 PC의 메일 출처를 등록했습니다.');
        })}
      >
        현재 MCP 출처 등록
      </Action>
      <Action
        disabled={registration.formState.isSubmitting}
        onAction={registration.handleSubmit(async ({ name }) => {
          await api('/collections', { name, requestId: crypto.randomUUID() });
          await load();
        })}
      >
        문서 모음 만들기
      </Action>
      <Action
        disabled={!value.sourceId || registration.formState.isSubmitting}
        onAction={registration.handleSubmit(async ({ name }) => {
          await api('/runners', {
            displayName: name,
            agents: [value.agent],
            sourceIds: [value.sourceId],
          });
          await load();
          notice('장치를 등록했습니다. 실행 가능 여부는 진단에서 별도로 확인합니다.');
        })}
      >
        이 PC 실행 장치 등록
      </Action>
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
              disabled={!member || !(kind === 'sources' ? value.sourceId : value.collectionId)}
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
              onAction={async () => {
                await api('/runners/' + r.id + '/revoke', {});
                await load();
              }}
            >
              장치 폐기
            </Action>
          )}
        </div>
      ))}
      <Typography component="h3" variant="h3">
        로컬 실행과 복구
      </Typography>
      <p>실행은 이 앱이 켜져 있는 동안만 유지됩니다. 설정 변경이나 로그아웃은 실행을 중지합니다.</p>
      <Action
        onAction={async () => {
          setRuntime(await api('/runtime'));
        }}
      >
        실행 상태 확인
      </Action>
      {runtime && (
        <p>
          분석: {runtime.analysis} · 동기화: {runtime.sync}
          {!runtime.analysisAvailable ? ' · 로컬 설정에 개인 분석 도구가 등록되지 않았습니다.' : ''}
        </p>
      )}
      <Action
        disabled={!value.runnerId}
        onAction={async () => {
          await api('/runtime/start', { kind: 'sync' });
          setRuntime(await api('/runtime'));
          notice('동기화 실행을 켰습니다. 메일함에서 동기화를 시작하세요.');
        }}
      >
        동기화 실행 켜기
      </Action>
      <Action
        disabled={!value.runnerId || !runtime?.analysisAvailable}
        onAction={async () => {
          await api('/runtime/start', { kind: 'analysis' });
          setRuntime(await api('/runtime'));
        }}
      >
        분석 실행 켜기
      </Action>
      <Action
        onAction={async () => {
          await api('/runtime/stop', {});
          setRuntime(await api('/runtime'));
        }}
      >
        로컬 실행 중지
      </Action>
      <Action
        disabled={!value.runnerId}
        onAction={async () => {
          setRecovery(await api('/runtime/recovery'));
        }}
      >
        미전송·중단 작업 확인
      </Action>
      {recovery && (
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
    </Panel>
  );
}
