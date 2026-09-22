import { z } from 'zod';

// Local UI CSP forbids dynamic code generation, including Zod's capability probe.
z.config({ jitless: true });

const username = z
  .string()
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/,
    '사용자명은 영문자로 시작하는 3~32자의 영문·숫자·_ . - 조합입니다.',
  );
const displayName = z
  .string()
  .min(1, '표시 이름을 입력하세요.')
  .max(100, '표시 이름은 100자까지 입력하세요.');
const role = z.enum(['viewer', 'analyst', 'admin']);
export const loginSchema = z.object({
  username,
  password: z.string().min(1, '비밀번호를 입력하세요.').max(128, '비밀번호가 너무 깁니다.'),
});
export const passwordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요.').max(128),
  newPassword: z
    .string()
    .min(12, '새 비밀번호는 12자 이상 입력하세요.')
    .refine(
      (value) => new TextEncoder().encode(value).length <= 128,
      '새 비밀번호는 UTF-8 기준 128바이트까지 입력하세요.',
    ),
});
export const createUserSchema = z.object({ username, displayName, role });
export const updateUserSchema = z.object({ displayName, role, active: z.boolean() });
export const settingsSchema = z.object({
  sourceId: z.string().min(1, '메일 출처를 선택하세요.'),
  collectionId: z.string().optional(),
  runnerId: z.string().optional(),
  agent: z.enum(['codex', 'claude']),
});
export const registrationSchema = z.object({
  name: z.string().min(1, '표시 이름을 입력하세요.').max(200, '표시 이름은 200자까지 입력하세요.'),
});
