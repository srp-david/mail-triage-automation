import { Field, SelectField, Panel } from '../components/Controls';
import { Button, Typography } from '@mui/material';
import { useState } from 'react';
import { useSession, errorText } from '../api/client';
import { Action } from '../components/Common';
export function UsernameForm({
  csrf,
  changed,
  notice,
}: {
  csrf: () => string;
  changed: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [name, setName] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        void (async () => {
          try {
            const r = await fetch('/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
              body: JSON.stringify({ username: name, password }),
            });
            if (!r.ok) {
              const b = await r.json();
              throw Error(
                b.code === 'LOGIN_RATE_LIMIT'
                  ? '로그인 시도가 많습니다. 15분 뒤 다시 시도하세요.'
                  : '로그인하지 못했습니다. 사용자명과 비밀번호를 확인하세요.',
              );
            }
            await changed();
          } catch (e) {
            notice(errorText(e));
          } finally {
            setPassword('');
            setBusy(false);
          }
        })();
      }}
    >
      <label>
        사용자명
        <Field
          name="username"
          autoComplete="username"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        비밀번호
        <Field
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <Button type="submit" variant="contained" disabled={busy}>
        로그인
      </Button>
      <p>계정 발급이나 비밀번호 초기화는 관리자에게 문의하세요.</p>
    </form>
  );
}
export function PasswordForm({ changed }: { changed: () => Promise<void> }) {
  const { api, notice } = useSession();
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState('');
  return (
    <Panel className="username-panel">
      <Typography component="h2" variant="h2">
        비밀번호 변경
      </Typography>
      <p>12자 이상으로 설정하세요. 변경 후 다시 로그인합니다.</p>
      <label>
        현재 비밀번호
        <Field
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        새 비밀번호
        <Field
          type="password"
          autoComplete="new-password"
          minLength={12}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <Action
        onAction={async () => {
          try {
            await api('/password', { currentPassword: current, newPassword: next });
            await changed();
            notice('비밀번호를 변경했습니다. 다시 로그인하세요.');
          } finally {
            setCurrent('');
            setNext('');
          }
        }}
      >
        비밀번호 변경
      </Action>
    </Panel>
  );
}
type User = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: string;
  active: boolean;
  must_change: boolean;
};
export function AdminUsers() {
  const { api } = useSession();
  const [users, setUsers] = useState<User[]>([]),
    [name, setName] = useState(''),
    [display, setDisplay] = useState(''),
    [role, setRole] = useState('analyst'),
    [temporary, setTemporary] = useState('');
  const load = async () => setUsers(await api<User[]>('/admin/users'));
  return (
    <Panel id="view-admin" className="username-panel">
      <Typography component="h2" variant="h2">
        사용자 관리
      </Typography>
      <Action onAction={load}>사용자 목록 조회</Action>
      <p>임시 비밀번호는 발급 직후 한 번만 확인할 수 있습니다. 안전한 사내 경로로 전달하세요.</p>
      {temporary && (
        <div role="status">
          <label>
            발급된 임시 비밀번호
            <Field readOnly value={temporary} autoComplete="off" />
          </label>
          <Action
            onAction={() => {
              setTemporary('');
            }}
          >
            닫기
          </Action>
        </div>
      )}
      <label>
        새 사용자명
        <Field value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <label>
        표시 이름
        <Field value={display} onChange={(e) => setDisplay(e.target.value)} />
      </label>
      <label>
        역할
        <SelectField aria-label="역할" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="analyst">분석 사용자</option>
          <option value="viewer">조회 사용자</option>
          <option value="admin">관리자</option>
        </SelectField>
      </label>
      <Action
        onAction={async () => {
          setTemporary('');
          const r = await api<{ temporaryPassword: string }>('/admin/users', {
            username: name,
            displayName: display,
            role,
          });
          setTemporary(r.temporaryPassword);
          setName('');
          setDisplay('');
          await load();
        }}
      >
        계정 생성
      </Action>
      {users.map((u) => (
        <UserRow key={u.id} user={u} changed={load} secret={setTemporary} />
      ))}
    </Panel>
  );
}
function UserRow({
  user: u,
  changed,
  secret,
}: {
  user: User;
  changed: () => Promise<void>;
  secret: (s: string) => void;
}) {
  const { api } = useSession();
  const [name, setName] = useState(u.display_name ?? ''),
    [role, setRole] = useState(u.role),
    [active, setActive] = useState(u.active);
  return (
    <fieldset>
      <legend>
        {u.username ?? '이관 대기'} {u.must_change ? '(비밀번호 변경 필요)' : ''}
      </legend>
      <label>
        표시 이름
        <Field value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        역할
        <SelectField aria-label="역할" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">조회 사용자</option>
          <option value="analyst">분석 사용자</option>
          <option value="admin">관리자</option>
        </SelectField>
      </label>
      <label>
        <Field type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        활성
      </label>
      <Action
        onAction={async () => {
          await api('/admin/users/' + u.id, { displayName: name, role, active });
          await changed();
        }}
      >
        계정 저장
      </Action>
      <Action
        onAction={async () => {
          secret('');
          const r = await api<{ temporaryPassword: string }>('/admin/users/' + u.id + '/reset', {});
          secret(r.temporaryPassword);
          await changed();
        }}
      >
        비밀번호 초기화
      </Action>
    </fieldset>
  );
}
