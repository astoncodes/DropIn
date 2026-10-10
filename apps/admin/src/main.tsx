import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';
import { AuthProvider } from './lib/auth';

const queryClient = new QueryClient({
  // Screens show wording a moderator can act on (see userMessage), which leaves
  // out the cause. The console keeps it for whoever has to find out why.
  queryCache: new QueryCache({
    onError: (error, query) => console.error('[admin] Could not load', query.queryKey, error),
  }),
  mutationCache: new MutationCache({
    onError: (error) => console.error('[admin] Could not save', error),
  }),
  defaultOptions: {
    queries: {
      // Venue data changes when a human reviews it, not continuously, so
      // refetching on every window focus is pure noise here.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No #root element — check index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
