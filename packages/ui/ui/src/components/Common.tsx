import { Button, type ButtonProps } from '@mui/material';
import { Component, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { errorText, useSession } from '../api/client';
// Third-party/sanitizing renderers own only the children of this otherwise empty leaf.
export function DomLeaf({
  create,
  className,
  muiButtons = false,
}: {
  create: () => HTMLElement;
  className?: string;
  muiButtons?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [buttons, setButtons] = useState<{ source: HTMLButtonElement; target: HTMLElement }[]>([]);
  useLayoutEffect(() => {
    const element = create(),
      items = muiButtons
        ? [...element.querySelectorAll('button')].map((source) => {
            const target = document.createElement('span');
            source.replaceWith(target);
            return { source, target };
          })
        : [];
    const observer = new MutationObserver(() => setButtons([...items]));
    items.forEach(({ source }) =>
      observer.observe(source, { attributes: true, childList: true, subtree: true }),
    );
    ref.current?.replaceChildren(element);
    setButtons(items);
    return () => {
      observer.disconnect();
      element.remove();
    };
  }, [create, muiButtons]);
  return (
    <>
      <div ref={ref} className={className} />
      {buttons.map(({ source, target }, index) =>
        createPortal(
          <Button
            type="button"
            hidden={!!source.hidden}
            disabled={source.disabled}
            onClick={() => source.click()}
          >
            {source.textContent}
          </Button>,
          target,
          String(index),
        ),
      )}
    </>
  );
}
export function Action({
  onAction,
  children,
  ...props
}: Omit<ButtonProps, 'onClick'> & {
  onAction: () => unknown | Promise<unknown>;
  children: ReactNode;
}) {
  const { notice } = useSession(),
    lock = useRef(false),
    [busy, setBusy] = useState(false);
  return (
    <Button
      variant={props.className?.includes('secondary-button') ? 'outlined' : 'contained'}
      type="button"
      {...props}
      disabled={props.disabled || busy}
      onClick={async () => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        try {
          await onAction();
        } catch (e) {
          notice(errorText(e));
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main>
        <p role="alert">화면을 표시하지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
        <Button onClick={() => location.reload()}>새로고침</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
