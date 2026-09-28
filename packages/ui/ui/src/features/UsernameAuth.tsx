import { Field, SelectField, Panel, Disclosure, DisclosureTitle } from '../components/Controls';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSession, errorText } from '../api/client';
import { Action } from '../components/Common';
import { Form } from '../forms/Form';
import { loginSchema, passwordSchema, createUserSchema, updateUserSchema } from '../forms/schemas';

export function UsernameForm({
  csrf,
  changed,
  notice,
}: {
  csrf: () => string;
  changed: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });
  return (
    <Form
      onSubmit={handleSubmit(async (values) => {
        try {
          const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
            body: JSON.stringify(values),
          });
          if (!response.ok) {
            const body = await response.json();
            throw Error(
              body.code === 'LOGIN_RATE_LIMIT'
                ? '로그인 시도가 많습니다. 15분 뒤 다시 시도하세요.'
                : '로그인하지 못했습니다. 사용자명과 비밀번호를 확인하세요.',
            );
          }
          await changed();
        } catch (error) {
          notice(errorText(error));
        } finally {
          resetField('password');
        }
      })}
    >
      <label>
        사용자명
        <Field
          {...register('username')}
          autoComplete="username"
          errorMessage={errors.username?.message}
        />
      </label>
      <label>
        비밀번호
        <Field
          {...register('password')}
          type="password"
          autoComplete="current-password"
          errorMessage={errors.password?.message}
        />
      </label>
      <Button type="submit" variant="contained" disabled={isSubmitting}>
        로그인
      </Button>
      <p>계정 발급이나 비밀번호 초기화는 관리자에게 문의하세요.</p>
    </Form>
  );
}

export function PasswordForm({
  changed,
  required = false,
}: {
  changed: () => Promise<void>;
  required?: boolean;
}) {
  const { api, notice } = useSession();
  const [submitError, setSubmitError] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  return (
    <Panel className="username-panel account-panel">
      <Typography variant="overline" color="primary">
        계정 보안
      </Typography>
      <Typography component="h2" variant="h2">
        {required ? '비밀번호 변경' : '내 계정'}
      </Typography>
      {required && (
        <Alert severity="info" sx={{ my: 2 }}>
          현재 비밀번호에는 발급받은 임시 비밀번호를 입력하고, 새 비밀번호에는 앞으로 사용할
          비밀번호를 입력하세요.
        </Alert>
      )}
      {!required && (
        <Typography component="h3" variant="h3" sx={{ mt: 3 }}>
          비밀번호 변경
        </Typography>
      )}
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        새 비밀번호는 12자 이상으로 설정하세요. 변경하면 로그아웃되며 새 비밀번호로 다시
        로그인합니다.
      </Typography>
      <Form
        className="account-password-form"
        onSubmit={handleSubmit(async (values) => {
          setSubmitError('');
          try {
            await api('/password', values);
            await changed();
            notice('비밀번호를 변경했습니다. 다시 로그인하세요.');
          } catch (error) {
            setSubmitError(errorText(error));
            notice(errorText(error));
          } finally {
            reset();
          }
        })}
      >
        {submitError && <Alert severity="error">{submitError}</Alert>}
        <label>
          현재 비밀번호
          <Field
            {...register('currentPassword')}
            type="password"
            autoComplete="current-password"
            errorMessage={errors.currentPassword?.message}
          />
        </label>
        <label>
          새 비밀번호
          <Field
            {...register('newPassword')}
            type="password"
            autoComplete="new-password"
            errorMessage={errors.newPassword?.message}
          />
        </label>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          비밀번호 변경
        </Button>
      </Form>
    </Panel>
  );
}

type Team = { id: string; name: string };
type User = {
  team_id?: string;
  team_name?: string;
  id: string;
  username: string | null;
  display_name: string | null;
  role: 'viewer' | 'analyst' | 'admin';
  active: boolean;
  must_change: boolean;
};
export function AdminUsers() {
  const { api, notice } = useSession();
  const [teams, setTeams] = useState<Team[]>([]);
  const [canCreateTeam, setCanCreateTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [users, setUsers] = useState<User[]>([]),
    [temporary, setTemporary] = useState<{ password: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [query, setQuery] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', displayName: '', role: 'analyst' },
  });
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [users, directory] = await Promise.all([
        api<User[]>('/admin/users'),
        api<{ teams: Team[]; canCreate: boolean }>('/admin/teams'),
      ]);
      setUsers(users);
      setTeams(directory.teams);
      setCanCreateTeam(directory.canCreate);
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  const needle = query.trim().toLocaleLowerCase();
  const visible = users.filter(
    (user) =>
      !needle ||
      [user.username, user.display_name, user.team_name].some((value) =>
        value?.toLocaleLowerCase().includes(needle),
      ),
  );
  return (
    <Panel id="view-admin" className="username-panel admin-users">
      <Box className="admin-header">
        <Box>
          <Typography variant="overline" color="primary">
            관리자
          </Typography>
          <Typography component="h2" variant="h2">
            계정 관리
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            사용자 계정과 권한, 이용 상태를 관리합니다.
          </Typography>
        </Box>
        <Action variant="outlined" disabled={loading} onAction={load}>
          목록 새로고침
        </Action>
      </Box>
      <Dialog
        open={!!temporary}
        onClose={() => setTemporary(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="temporary-password-title"
        aria-describedby="temporary-password-description"
      >
        <DialogTitle id="temporary-password-title">임시 비밀번호 발급 완료</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Box sx={{ overflowWrap: 'anywhere' }}>
              <Typography variant="body2" color="text.secondary">
                발급 계정
              </Typography>
              <Typography sx={{ fontWeight: 700, mt: 0.5 }}>{temporary?.name}</Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="발급된 임시 비밀번호"
              value={temporary?.password ?? ''}
              autoComplete="off"
              slotProps={{
                input: { readOnly: true },
                htmlInput: {
                  spellCheck: false,
                  style: { fontFamily: 'Consolas, monospace', fontSize: 16 },
                },
              }}
            />
            <Alert id="temporary-password-description" severity="info">
              닫으면 다시 확인할 수 없습니다. 비밀번호를 복사해 안전한 사내 경로로 전달하세요.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setTemporary(null)}>
            확인 후 닫기
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ my: 2 }}>
        <Typography variant="h3">팀 관리</Typography>
        <Stack direction="row" spacing={1} sx={{ my: 1 }}>
          {teams.map((team) => (
            <Chip key={team.id} label={team.name} />
          ))}
        </Stack>
        {canCreateTeam && (
          <Stack direction="row" spacing={1}>
            <Field
              aria-label="새 팀 이름"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="추가할 팀 이름"
            />
            <Action
              disabled={!teamName.trim()}
              onAction={async () => {
                await api('/admin/teams', { name: teamName.trim() });
                setTeamName('');
                await load();
                notice('팀을 추가했습니다.');
              }}
            >
              팀 추가
            </Action>
          </Stack>
        )}
      </Box>
      <Disclosure className="admin-create">
        <DisclosureTitle>새 계정 만들기</DisclosureTitle>
        <Typography variant="body2" color="text.secondary" sx={{ px: 1, my: 1 }}>
          계정을 만들면 임시 비밀번호가 발급됩니다. 사용자는 첫 로그인 후 비밀번호를 변경합니다.
        </Typography>
        <Form
          className="admin-user-fields"
          onSubmit={handleSubmit(async (values) => {
            try {
              setTemporary(null);
              const result = await api<{ temporaryPassword: string }>('/admin/users', {
                ...values,
                teamId: values.teamId || undefined,
              });
              setTemporary({ password: result.temporaryPassword, name: values.username });
              reset({ ...values, username: '', displayName: '' });
              await load();
            } catch (error) {
              notice(errorText(error));
            }
          })}
        >
          <label>
            새 사용자명
            <Field
              {...register('username')}
              autoComplete="off"
              errorMessage={errors.username?.message}
            />
          </label>
          <label>
            표시 이름
            <Field {...register('displayName')} errorMessage={errors.displayName?.message} />
          </label>
          <label>
            역할
            <SelectField aria-label="역할" {...register('role')}>
              <option value="analyst">분석 사용자</option>
              <option value="viewer">조회 사용자</option>
              <option value="admin">관리자</option>
            </SelectField>
          </label>
          <label>
            소속 팀
            <SelectField aria-label="새 계정 소속 팀" {...register('teamId')}>
              <option value="">내 팀 (기본)</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </SelectField>
          </label>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            계정 생성
          </Button>
        </Form>
      </Disclosure>
      <Box className="admin-list-tools">
        <Box>
          <Typography variant="h3">계정 목록</Typography>
          <Typography variant="body2" color="text.secondary">
            {loading
              ? '목록 확인 중'
              : loadError
                ? '목록 확인 필요'
                : `전체 ${users.length}명 · 사용 중 ${users.filter((user) => user.active).length}명 · 사용 중지 ${users.filter((user) => !user.active).length}명`}
          </Typography>
        </Box>
        <Field
          aria-label="계정 검색"
          placeholder="사용자명 또는 표시 이름"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Box>
      {loading && <LinearProgress aria-label="계정 목록 불러오는 중" />}
      {loadError && <Alert severity="error">목록을 불러오지 못했습니다. {loadError}</Alert>}
      {!loading && !loadError && !visible.length && (
        <Box className="admin-empty">
          <Typography>
            {query ? '검색 조건에 맞는 계정이 없습니다.' : '등록된 계정이 없습니다.'}
          </Typography>
        </Box>
      )}
      <Stack spacing={2} sx={{ mt: 2 }}>
        {visible.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            teams={teams}
            changed={load}
            secret={(password) =>
              setTemporary(
                password
                  ? { password, name: user.username ?? user.display_name ?? '이관 대기' }
                  : null,
              )
            }
          />
        ))}
      </Stack>
    </Panel>
  );
}

function UserRow({
  user,
  teams,
  changed,
  secret,
}: {
  user: User;
  teams: Team[];
  changed: () => Promise<void>;
  secret: (s: string) => void;
}) {
  const { api, notice } = useSession();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof updateUserSchema>>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      displayName: user.display_name ?? '',
      role: user.role,
      active: user.active,
      teamId: user.team_id,
    },
  });
  useEffect(() => {
    reset({
      displayName: user.display_name ?? '',
      role: user.role,
      active: user.active,
      teamId: user.team_id,
    });
  }, [user.display_name, user.role, user.active, user.team_id, reset]);
  return (
    <Box
      component="article"
      className="admin-user-card"
      aria-label={`${user.username ?? '이관 대기'} 계정`}
    >
      <Box className="admin-user-summary">
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h4" variant="h3">
            {user.display_name || user.username || '표시 이름 없음'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            사용자명 · {user.username ?? '이관 대기'} · {user.team_name ?? '팀 확인 필요'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip
            size="small"
            variant="outlined"
            label={{ viewer: '조회 사용자', analyst: '분석 사용자', admin: '관리자' }[user.role]}
          />
          <Chip
            size="small"
            color={user.active ? 'success' : 'default'}
            label={user.active ? '사용 중' : '사용 중지'}
          />
          {user.must_change && (
            <Chip size="small" color="warning" variant="outlined" label="비밀번호 변경 필요" />
          )}
        </Stack>
      </Box>
      <Disclosure className="admin-user-edit">
        <DisclosureTitle>계정 정보 수정</DisclosureTitle>
        <Form
          className="admin-user-fields"
          onSubmit={handleSubmit(async (values) => {
            try {
              await api('/admin/users/' + user.id, values);
              await changed();
              notice('계정 정보를 저장했습니다.');
            } catch (error) {
              notice(errorText(error));
            }
          })}
        >
          <label>
            표시 이름
            <Field {...register('displayName')} errorMessage={errors.displayName?.message} />
          </label>
          <label>
            역할
            <SelectField aria-label="역할" {...register('role')}>
              <option value="viewer">조회 사용자</option>
              <option value="analyst">분석 사용자</option>
              <option value="admin">관리자</option>
            </SelectField>
          </label>
          <label>
            소속 팀
            <SelectField aria-label="소속 팀" {...register('teamId')}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label>
            <Controller
              name="active"
              control={control}
              render={({ field }) => (
                <Field
                  type="checkbox"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  checked={field.value}
                  onChange={(event) => field.onChange(event.target.checked)}
                />
              )}
            />
            계정 사용 허용
          </label>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            계정 저장
          </Button>
        </Form>
      </Disclosure>
      <Box className="admin-reset">
        <Typography variant="body2" color="text.secondary">
          비밀번호를 잊은 사용자에게 새 임시 비밀번호를 발급합니다.
        </Typography>
        <Action
          variant="text"
          color="warning"
          disabled={isSubmitting}
          onAction={async () => {
            secret('');
            const result = await api<{ temporaryPassword: string }>(
              '/admin/users/' + user.id + '/reset',
              {},
            );
            secret(result.temporaryPassword);
            await changed();
          }}
        >
          비밀번호 초기화
        </Action>
      </Box>
    </Box>
  );
}
