import { Field, SelectField, Panel } from '../components/Controls';
import { Button, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
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

export function PasswordForm({ changed }: { changed: () => Promise<void> }) {
  const { api, notice } = useSession();
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
    <Panel className="username-panel">
      <Typography component="h2" variant="h2">
        비밀번호 변경
      </Typography>
      <p>12자 이상으로 설정하세요. 변경 후 다시 로그인합니다.</p>
      <Form
        onSubmit={handleSubmit(async (values) => {
          try {
            await api('/password', values);
            await changed();
            notice('비밀번호를 변경했습니다. 다시 로그인하세요.');
          } catch (error) {
            notice(errorText(error));
          } finally {
            reset();
          }
        })}
      >
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

type User = {
  id: string;
  username: string | null;
  display_name: string | null;
  role: 'viewer' | 'analyst' | 'admin';
  active: boolean;
  must_change: boolean;
};
export function AdminUsers() {
  const { api, notice } = useSession();
  const [users, setUsers] = useState<User[]>([]),
    [temporary, setTemporary] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', displayName: '', role: 'analyst' },
  });
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
          <Action onAction={() => setTemporary('')}>닫기</Action>
        </div>
      )}
      <Form
        onSubmit={handleSubmit(async (values) => {
          try {
            setTemporary('');
            const result = await api<{ temporaryPassword: string }>('/admin/users', values);
            setTemporary(result.temporaryPassword);
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
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          계정 생성
        </Button>
      </Form>
      {users.map((user) => (
        <UserRow key={user.id} user={user} changed={load} secret={setTemporary} />
      ))}
    </Panel>
  );
}

function UserRow({
  user,
  changed,
  secret,
}: {
  user: User;
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
    defaultValues: { displayName: user.display_name ?? '', role: user.role, active: user.active },
  });
  useEffect(() => {
    reset({ displayName: user.display_name ?? '', role: user.role, active: user.active });
  }, [user.display_name, user.role, user.active, reset]);
  return (
    <fieldset>
      <legend>
        {user.username ?? '이관 대기'} {user.must_change ? '(비밀번호 변경 필요)' : ''}
      </legend>
      <Form
        onSubmit={handleSubmit(async (values) => {
          try {
            await api('/admin/users/' + user.id, values);
            await changed();
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
          활성
        </label>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          계정 저장
        </Button>
      </Form>
      <Action
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
    </fieldset>
  );
}
