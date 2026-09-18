import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app/App';
import {ErrorBoundary} from './components/Common';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from './api/queries';
import '../../../../public/style.css';
createRoot(document.body).render(<StrictMode><QueryClientProvider client={queryClient}><ErrorBoundary><App/></ErrorBoundary></QueryClientProvider></StrictMode>);
