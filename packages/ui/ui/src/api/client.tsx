import { createContext, useContext } from 'react';
import type { Api } from './types';
import { isCancelledError } from '@tanstack/react-query';
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
export const aborted = (error: unknown) =>
  isCancelledError(error) || (error instanceof Error && error.name === 'AbortError');
export function createApi(unauthorized: () => void, csrf: () => string = () => ''): Api {
  return async <T,>(path: string, body?: unknown, signal?: AbortSignal) => {
    const response = await fetch('/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      signal,
      headers:
        body === undefined
          ? undefined
          : { 'Content-Type': 'application/json', ...(csrf() ? { 'X-CSRF-Token': csrf() } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401) {
      unauthorized();
      throw Error('다시 로그인하세요.');
    }
    const value = await response.json();
    if (!response.ok) {
      const messages: Record<string, string> = {
        LOCAL_MCP_NOT_CONFIGURED:
          'Mail MCP 주소가 설정되지 않았습니다. 개인 연결의 연결 설정 안내를 확인하세요.',
        RUNNER_REQUIRED: '이 PC의 실행 장치를 선택하고 저장하세요.',
        RUNNER_DENIED:
          '이 PC에서 사용할 수 없는 실행 장치입니다. 이 PC를 새 장치로 등록하고 선택하세요.',
        ORIGINAL_UNAVAILABLE:
          '이 PC에 선택한 출처의 원본이 없습니다. 메일 출처와 원본 연결을 확인하세요.',
        ADAPTER_NOT_RELEASE_APPROVED: '개인 AI 도구의 실행 설정을 확인하고 앱을 다시 시작하세요.',
        RECONNECT_EVIDENCE_REQUIRED:
          '대조할 분석 이력이 없습니다. 기존 출처와 동일한 저장소인지 담당자에게 확인하세요.',
        RECONNECT_IDENTITY_MISMATCH:
          '기존 이력과 현재 메일 저장소가 일치하지 않습니다. 다른 저장소라면 새 출처로 등록하세요.',
        RECONNECT_EXPIRED:
          '원본 대조 시간이 만료됐습니다. 기존 이력과 원본 대조를 다시 실행하세요.',
        LAST_ADMIN: '마지막 활성 관리자는 비활성화하거나 강등할 수 없습니다.',
        USERNAME_EXISTS: '이미 사용 중인 사용자명입니다.',
        USERNAME_INVALID: '사용자명은 영문으로 시작하는 3~32자 영문·숫자·_.-만 사용할 수 있습니다.',
        PASSWORD_POLICY: '비밀번호는 12자 이상, UTF-8 128바이트 이하여야 합니다.',
        PASSWORD_UNCHANGED: '이전과 다른 비밀번호를 설정하세요.',
        PASSWORD_CHANGE_REQUIRED: '먼저 비밀번호를 변경하세요.',
        ADMIN_REQUIRED: '관리자 권한이 필요합니다.',
        AUTH_BUSY: '인증 요청을 처리 중입니다. 잠시 후 다시 시도하세요.',
        LOGIN_DENIED: '현재 비밀번호를 확인하세요.',
        EXPLICIT_MAPPING_REQUIRED: '운영자의 기존 사용자 연결 절차가 필요합니다.',
      };
      throw Error(messages[value.code] ?? value.message ?? value.error ?? '요청 실패');
    }
    return value as T;
  };
}
export const SessionContext = createContext<{
  api: Api;
  storeId: string;
  userId?: string;
  notice: (text: string) => void;
  unauthorized: () => void;
}>({} as never);
export const useSession = () => useContext(SessionContext);
