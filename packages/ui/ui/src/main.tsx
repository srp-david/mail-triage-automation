import { StrictMode } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './components/Common';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queries';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme';
import './layout.css';
import './document-content.css';
const cache = createCache({
  key: 'triage',
  nonce: document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content,
  prepend: true,
});
createRoot(document.body).render(
  <StrictMode>
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
    </CacheProvider>
  </StrictMode>,
);
