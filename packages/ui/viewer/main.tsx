import React, { Component, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from '../ui/src/theme';
import './viewer.css';

type PreviewFile = { format: 'docx' | 'pptx' | 'xlsx'; filename: string; buffer: ArrayBuffer };
const origin = location.origin;
function notify(state: 'ready' | 'loaded' | 'error' | 'close') {
  parent.postMessage({ type: 'office-preview', state }, origin);
}
const failure = (
  <p role="alert">문서를 표시하지 못했습니다. 닫은 뒤 다시 시도하거나 원본을 다운로드해 주세요.</p>
);
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    notify('error');
  }
  render() {
    return this.state.failed ? failure : this.props.children;
  }
}

function Preview({ file }: { file: PreviewFile }) {
  const [content, setContent] = useState<ReactNode>(<p role="status">문서를 여는 중입니다…</p>);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function load() {
      if (file.format === 'docx') {
        const lib = await import('@extend-ai/react-docx');
        const wasm = await import('@extend-ai/react-docx/docx_wasm_bg.wasm?url');
        lib.setWasmSource(new URL(wasm.default, location.href).href);
        const doc = await lib.parseDocxForViewer(file.buffer, {
          useWorker: 'required',
          loadEmbeddedFonts: false,
        });
        dispose = () => doc.dispose();
        if (cancelled) {
          dispose();
          return;
        }
        setContent(
          <lib.ReactDocxViewer document={doc} loadEmbeddedFonts={false} defaultZoom="fit-width" />,
        );
        notify('loaded');
      } else if (file.format === 'pptx') {
        const lib = await import('@extend-ai/react-pptx');
        const wasm = await import('@extend-ai/react-pptx/pptx_wasm_bg.wasm?url');
        await import('@extend-ai/react-pptx/styles.css');
        lib.setWasmSource(new URL(wasm.default, location.href).href);
        if (cancelled) return;
        setContent(
          <lib.ReactPptxViewer
            source={file.buffer}
            mode="continuous"
            height="100%"
            defaultZoom="fit-width"
            showToolbar
            showThumbnails={false}
            showDiagnostics={false}
            renderError={() => failure}
            renderLoading={() => <p>슬라이드를 여는 중입니다…</p>}
            onLoad={() => notify('loaded')}
            onError={() => notify('error')}
          />,
        );
      } else {
        const lib = await import('@extend-ai/react-xlsx');
        const wasm = await import('@extend-ai/react-xlsx/duke_sheets_wasm_bg.wasm?url');
        lib.setWasmSource(new URL(wasm.default, location.href).href);
        if (cancelled) return;
        function Workbook() {
          const controller = lib.useXlsxViewerController({
            file: file.buffer,
            fileName: file.filename,
            readOnly: true,
            maxFileSizeBytes: 5 * 1024 * 1024,
            useWorker: true,
          });
          useEffect(() => {
            if (controller.error) notify('error');
            else if (!controller.isLoading && controller.tabs.length) notify('loaded');
          }, [controller.error, controller.isLoading, controller.tabs.length]);
          return (
            <lib.XlsxViewer
              controller={controller}
              height="100dvh"
              readOnly
              showDefaultToolbar={false}
              toolbar={
                <div className="sheet-toolbar">
                  <div className="sheet-tabs" aria-label="시트 선택">
                    {controller.tabs.map((tab, index) => (
                      <Button
                        key={index}
                        type="button"
                        variant={controller.activeTabIndex === index ? 'contained' : 'outlined'}
                        aria-pressed={controller.activeTabIndex === index}
                        onClick={() => controller.setActiveTabIndex(index)}
                      >
                        {tab.name}
                      </Button>
                    ))}
                  </div>
                  <div className="sheet-zoom">
                    <Button
                      type="button"
                      aria-label="축소"
                      disabled={!controller.canZoomOut}
                      onClick={controller.zoomOut}
                    >
                      −
                    </Button>
                    <span>{Math.round(controller.zoomScale)}%</span>
                    <Button
                      type="button"
                      aria-label="확대"
                      disabled={!controller.canZoomIn}
                      onClick={controller.zoomIn}
                    >
                      +
                    </Button>
                  </div>
                </div>
              }
              loadingState={<p>시트를 여는 중입니다…</p>}
              errorState={failure}
            />
          );
        }
        setContent(<Workbook />);
      }
    }
    void load().catch(() => {
      if (!cancelled) {
        setContent(failure);
        notify('error');
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [file]);
  return <Boundary>{content}</Boundary>;
}

const root = createRoot(document.getElementById('root')!);
// A frame accepts one document, only from its own parent. It never receives credentials or API URLs.
let accepted = false;
window.addEventListener('message', (event) => {
  const data = event.data;
  if (
    accepted ||
    event.source !== parent ||
    event.origin !== origin ||
    data?.type !== 'office-preview-file'
  )
    return;
  if (
    !(data.buffer instanceof ArrayBuffer) ||
    data.buffer.byteLength > 5 * 1024 * 1024 ||
    !['docx', 'pptx', 'xlsx'].includes(data.format) ||
    typeof data.filename !== 'string'
  )
    return;
  accepted = true;
  root.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Preview file={data} />
    </ThemeProvider>,
  );
});
// Document hyperlinks are display-only, including keyboard activation and middle-click.
for (const name of ['click', 'auxclick'])
  document.addEventListener(
    name,
    (event) => {
      if ((event.target as Element)?.closest?.('a')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') notify('close');
});
notify('ready');
