import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Field, SelectField } from './Controls';

test('MUI input forwards the native ref, name and user input', async () => {
  const ref = createRef<HTMLInputElement>();
  const changed = vi.fn();
  render(
    <label>
      사용자명
      <Field ref={ref} name="username" onChange={changed} />
    </label>,
  );
  const input = screen.getByRole('textbox', { name: '사용자명' });
  await userEvent.type(input, 'tester');
  expect(ref.current).toBe(input);
  expect(input).toHaveValue('tester');
  expect(input).toHaveAttribute('name', 'username');
  expect(changed).toHaveBeenCalledTimes(6);
});

test('select and checkbox preserve accessible native input behavior', async () => {
  const selected = vi.fn();
  render(
    <>
      <label>
        실행 Agent
        <SelectField defaultValue="codex" onChange={selected}>
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
        </SelectField>
      </label>
      <label>
        활성
        <Field type="checkbox" />
      </label>
    </>,
  );
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '실행 Agent' }), 'claude');
  expect(screen.getByRole('combobox')).toHaveValue('claude');
  expect(selected).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('checkbox', { name: '활성' }));
  expect(screen.getByRole('checkbox')).toBeChecked();
});
