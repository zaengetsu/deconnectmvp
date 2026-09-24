'use client';
import { SessionProvider, ToastProvider } from '@rekonect/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { API_URL } from '@/lib/config';

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(
    () =>
      client ??
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: (count, err) => count < 2 && (err as { status?: number }).status !== 403 && (err as { status?: number }).status !== 404, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider baseUrl={API_URL} storageKey="rekonect.admin.session" roles={['admin']}>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
