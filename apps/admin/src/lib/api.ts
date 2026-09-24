'use client';
import { adminApi } from '@rekonect/api-client';
import { useSession } from '@rekonect/ui';
import { useMemo } from 'react';

/** Client de l'API admin, lié à la session courante. */
export function useAdmin() {
  const { http } = useSession();
  return useMemo(() => adminApi(http), [http]);
}

export type AdminApi = ReturnType<typeof adminApi>;
