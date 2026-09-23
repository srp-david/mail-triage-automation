import { useCallback, useEffect, useRef, useState } from 'react';
import { aborted, errorText } from '../api/client';
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
export function usePolling(task: () => Promise<unknown> | void, delay: number, enabled = true) {
  const latest = useLatest(task);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      busy = false;
    const timer = setInterval(() => {
      if (disposed || busy) return;
      busy = true;
      Promise.resolve()
        .then(() => !disposed && latest.current())
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, delay);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [delay, enabled, latest]);
}
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string,
  enabled = true,
) {
  const latest = useLatest(load),
    epoch = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: true,
    error: '',
  });
  const refresh = useCallback(
    async (clear = false) => {
      const id = ++epoch.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      setState((old) => ({ ...old, data: clear ? null : old.data, loading: true, error: '' }));
      try {
        const data = await latest.current(request.signal);
        if (id === epoch.current && !request.signal.aborted)
          setState({ data, loading: false, error: '' });
        return data;
      } catch (error) {
        if (id === epoch.current && !aborted(error))
          setState((old) => ({ ...old, loading: false, error: errorText(error) }));
        return null;
      }
    },
    [latest],
  );
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: enabled, error: '' });
    queueMicrotask(() => {
      if (alive && enabled) void refresh();
    });
    return () => {
      alive = false;
      epoch.current += 1;
      controller.current?.abort();
    };
  }, [key, enabled, refresh]);
  return { ...state, refresh };
}
