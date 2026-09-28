import { useCallback, useEffect, useState } from 'react';

export function useNotice() {
  const [value, setValue] = useState({ text: '' });
  const notify = useCallback((text: string) => setValue({ text }), []);
  useEffect(() => {
    if (!value.text) return;
    const timer = setTimeout(() => setValue({ text: '' }), 5000);
    return () => clearTimeout(timer);
  }, [value]);
  return [value.text, notify] as const;
}
