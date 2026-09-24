'use client';
import { type PartnerAccount, type PartnerDetail, partnerApi } from '@rekonect/api-client';
import { useSession } from '@rekonect/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CURRENT_KEY = 'rekonect.partners.current';

export function usePartnerApi() {
  const { http } = useSession();
  return useMemo(() => partnerApi(http), [http]);
}

interface PartnerContextValue {
  accounts: PartnerAccount[];
  account: PartnerAccount | null;
  detail: PartnerDetail | null;
  partnerId: string | null;
  loading: boolean;
  error: unknown;
  setAccount(id: string): void;
  /** Droits effectifs sur le compte courant. */
  can: { edit: boolean; manage: boolean; view: boolean };
}

const PartnerContext = createContext<PartnerContextValue | null>(null);
const RANK: Record<string, number> = { reception: 0, viewer: 1, editor: 2, owner: 3 };

/** Compte partenaire courant (sélecteur « Changer de compte ») et ses droits. */
export function PartnerProvider({ children }: { children: ReactNode }) {
  const api = usePartnerApi();
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ['partner-accounts'], queryFn: api.accounts });
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (!accounts.data?.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CURRENT_KEY);
    } catch {
      /* stockage indisponible */
    }
    const ids = accounts.data.map((a) => a.id);
    setCurrent((c) => (c && ids.includes(c) ? c : saved && ids.includes(saved) ? saved : ids[0]));
  }, [accounts.data]);

  const detail = useQuery({ queryKey: ['partner', current], queryFn: () => api.detail(current!), enabled: !!current });
  const setAccount = useCallback(
    (id: string) => {
      setCurrent(id);
      try {
        localStorage.setItem(CURRENT_KEY, id);
      } catch {
        /* stockage indisponible */
      }
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'partner-accounts' });
    },
    [qc],
  );

  const account = accounts.data?.find((a) => a.id === current) ?? null;
  const role = detail.data?.myRole ?? account?.role ?? 'reception';
  const value: PartnerContextValue = {
    accounts: accounts.data ?? [],
    account,
    detail: detail.data ?? null,
    partnerId: current,
    loading: accounts.isLoading || (!!current && detail.isLoading),
    error: accounts.error ?? detail.error,
    setAccount,
    can: { view: RANK[role] >= 1, edit: RANK[role] >= 2, manage: RANK[role] >= 3 },
  };
  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner() {
  const v = useContext(PartnerContext);
  if (!v) throw new Error('usePartner doit être utilisé dans <PartnerProvider>');
  return v;
}

/** Id du compte courant (non nul une fois le portail chargé). */
export function usePartnerId(): string {
  return usePartner().partnerId ?? '';
}
