import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type HTMLAttributes,
} from 'react';
import { Checkbox, NativeSelect, OutlinedInput, Paper, TextField } from '@mui/material';
import { styled } from '@mui/material/styles';

// Keep native input identities/events: search IME handling, labels, and focus restoration depend on them.
export const Field = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { errorMessage?: string }
>(function Field(
  { onChange, value, defaultValue, type, disabled, className, errorMessage, ...props },
  ref,
) {
  if (type === 'checkbox')
    return (
      <Checkbox
        className={className}
        disabled={disabled}
        checked={props.checked}
        onChange={onChange}
        slotProps={{ input: { ...props, ref } }}
      />
    );
  return (
    <TextField
      error={!!errorMessage}
      helperText={errorMessage}
      slotProps={{
        htmlInput: props,
        inputLabel: type === 'date' ? { shrink: true } : undefined,
        formHelperText: { role: 'alert' },
      }}
      className={className}
      type={type}
      disabled={disabled}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      inputRef={ref}
      id={props.id}
      label={props['aria-label']}
      autoComplete={props.autoComplete}
      required={props.required}
    />
  );
});
export const SelectField = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ children, className, disabled, ...props }, ref) {
    return (
      <NativeSelect
        className={className}
        disabled={disabled}
        input={<OutlinedInput size="small" inputRef={ref} />}
        inputProps={props}
      >
        {children}
      </NativeSelect>
    );
  },
);
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ onChange, value, disabled, ...props }, ref) {
  return (
    <TextField
      fullWidth
      multiline
      disabled={disabled}
      value={value}
      onChange={onChange}
      inputRef={ref}
      label={props['aria-label']}
      slotProps={{ input: { inputComponent: 'textarea' }, htmlInput: { ...props, rows: 4 } }}
    />
  );
});
export const Panel = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Panel(props, ref) {
    return (
      <Paper component="section" variant="outlined" className="ui-panel" {...props} ref={ref} />
    );
  },
);
// Native disclosure semantics preserve thread expansion and drag/drop without extra focusable buttons.
export const Disclosure = styled('details')(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  color: theme.palette.text.primary,
  '& > summary': {
    cursor: 'pointer',
    padding: '8px 10px',
    fontWeight: 600,
    borderRadius: theme.shape.borderRadius,
    '&:hover': { background: theme.palette.action.hover },
    '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}` },
  },
}));
export const DisclosureTitle = styled('summary')({});
