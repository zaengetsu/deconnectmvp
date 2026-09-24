import { type ReactNode, Suspense } from 'react';
import { Shell } from '@/components/shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <Suspense>{children}</Suspense>
    </Shell>
  );
}
