import { useRef, useState } from 'react';
import { Alert, Button, Typography } from '@mui/material';
import { Field, SelectField } from '../components/Controls';
import { errorText, useSession } from '../api/client';

export type AgentCommand = {
  executable: string;
  prefix?: string[];
  wsl?: { distribution: string; user?: string };
};
export const wslError = (code?: string) => {
  const messages: Record<string, string> = {
    WSL_START_FAILED:
      'WSL을 시작하지 못했습니다. 배포판·사용자 이름과 WSL 내부 python3 설치를 확인하세요.',
    WSL_AGENT_NOT_FOUND:
      '선택한 WSL에서 AI 도구를 찾지 못했습니다. Linux 실행 파일의 절대 경로를 입력하세요.',
    WSL_AGENT_START_FAILED:
      'WSL의 AI 도구를 실행하지 못했습니다. 실행 권한과 필요한 런타임을 확인하세요.',
    WSL_PATH_UNAVAILABLE:
      'WSL에서 작업 폴더를 열지 못했습니다. Windows 드라이브 마운트와 wslpath를 확인하세요.',
    WSL_NETWORK_UNAVAILABLE:
      'WSL에서 앱에 연결하지 못했습니다. WSL2 mirrored 네트워크와 방화벽 설정을 확인하세요.',
    WSL_WINDOWS_REQUIRED: 'WSL 실행은 Windows 앱에서 지원합니다.',
    WSL_HELPER_FAILED: 'WSL 실행 준비에 실패했습니다. WSL 내부 python3와 실행 환경을 확인하세요.',
    CLI_CANCELLED: 'WSL 실행 확인 시간이 초과됐거나 중단됐습니다. 배포판 시작 상태를 확인하세요.',
  };
  return code ? messages[code] : undefined;
};

export function AgentEnvironment({
  agent,
  command,
  onChange,
}: {
  agent: 'codex' | 'claude';
  command: AgentCommand;
  onChange: (value: AgentCommand) => void;
}) {
  const { api } = useSession();
  const label = agent === 'codex' ? 'Codex' : 'Claude Code';
  const previous = useRef<{ windows?: AgentCommand; wsl?: AgentCommand }>({});
  const [distributions, setDistributions] = useState<string[]>();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <>
      <SelectField
        aria-label={`${label} 실행 환경`}
        value={command.wsl ? 'wsl' : 'windows'}
        onChange={(event) => {
          const mode = event.target.value as 'windows' | 'wsl';
          previous.current[command.wsl ? 'wsl' : 'windows'] = command;
          onChange(
            previous.current[mode] ??
              (mode === 'wsl'
                ? { executable: agent, wsl: { distribution: '' } }
                : { executable: '' }),
          );
        }}
      >
        <option value="windows">Windows</option>
        <option value="wsl">WSL</option>
      </SelectField>
      {command.wsl && (
        <>
          <Typography variant="body2" color="text.secondary">
            AI 도구를 설치하고 로그인한 WSL 배포판을 선택하세요. 앱 로그인과 장치 인증은 Windows에
            유지됩니다.
          </Typography>
          <Field
            aria-label={`${label} WSL 배포판`}
            placeholder="Ubuntu"
            value={command.wsl.distribution}
            onChange={(event) =>
              onChange({ ...command, wsl: { ...command.wsl!, distribution: event.target.value } })
            }
          />
          <Field
            aria-label={`${label} WSL 사용자`}
            placeholder="기본 Linux 사용자 (비워 두기 가능)"
            value={command.wsl.user ?? ''}
            onChange={(event) =>
              onChange({
                ...command,
                wsl: { ...command.wsl!, user: event.target.value || undefined },
              })
            }
          />
          <Button
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              setMessage('');
              try {
                const result = await api<{ available: boolean; distributions: string[] }>(
                  '/connections/wsl',
                );
                setDistributions(result.distributions);
                if (!result.available)
                  setMessage(
                    'WSL 목록을 확인하지 못했습니다. Windows의 WSL 설치 상태를 확인하세요.',
                  );
                else if (!result.distributions.length)
                  setMessage(
                    '사용자용 WSL 배포판이 없습니다. Ubuntu 등의 배포판을 준비하세요. Docker 전용 배포판은 사용하지 않습니다.',
                  );
              } catch (error) {
                setMessage(errorText(error));
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? '배포판 확인 중…' : `${label} WSL 배포판 찾기`}
          </Button>
          {!!distributions?.length && (
            <SelectField
              aria-label={`${label} 발견한 WSL 배포판`}
              value=""
              onChange={(event) => {
                if (event.target.value)
                  onChange({
                    ...command,
                    wsl: { ...command.wsl!, distribution: event.target.value },
                  });
              }}
            >
              <option value="">배포판 선택</option>
              {distributions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          )}
          {message && <Alert severity="info">{message}</Alert>}
          <Typography variant="body2">
            WSL 내부에 Python 3가 필요합니다. WSL2는 mirrored 네트워크를 사용하고 실행 확인으로
            앱과의 연결을 검사하세요. 기존 WSL·방화벽 설정은 자동 변경하지 않습니다.
          </Typography>
        </>
      )}
    </>
  );
}
