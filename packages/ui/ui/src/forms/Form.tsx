import { useRef, type FormEvent, type FormHTMLAttributes } from 'react';

// Preserve Korean IME composition and synchronously lock duplicate submissions.
export function Form({
  onSubmit,
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const locked = useRef(false);
  const composing = useRef(false);
  return (
    <form
      {...props}
      noValidate
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
        )
          event.preventDefault();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current || composing.current) return;
        locked.current = true;
        try {
          await onSubmit(event);
        } finally {
          locked.current = false;
        }
      }}
    >
      {children}
    </form>
  );
}
