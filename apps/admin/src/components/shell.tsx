'use client';
import { formatNumber, initialsOf } from '@rekonect/api-client';
import { C, CountBadge, Logo, Modal, Spinner, TextInput, useSession } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAdmin } from '@/lib/api';

export const NAV = [
  { id: 'overview', href: '/', label: "Vue d'ensemble", section: 'PILOTAGE', shape: '3px' },
  { id: 'activities', href: '/activities', label: 'Activités', section: 'CATALOGUE', shape: '50%' },
  { id: 'rewards', href: '/rewards', label: 'Récompenses', shape: '3px 50% 3px 50%' },
  { id: 'families', href: '/families', label: 'Familles', section: 'UTILISATEURS', shape: '50% 50% 3px 3px' },
  { id: 'partners', href: '/partners', label: 'Partenaires', shape: '3px 3px 50% 50%' },
  { id: 'plans', href: '/plans', label: 'Plans & abonnements', section: 'BUSINESS', shape: '2px' },
] as const;

const ENV_CHIP: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  production: { label: 'Production', bg: '#E9F1EC', fg: '#4A7A5F', dot: '#6E9E85' },
  staging: { label: 'Pré-production', bg: '#FBF0DA', fg: '#96681A', dot: '#E8B33F' },
  development: { label: 'Développement', bg: '#EEEFFB', fg: '#3C41A8', dot: '#3C41A8' },
};

export function activeNav(pathname: string) {
  return NAV.find((n) => (n.href === '/' ? pathname === '/' : pathname.startsWith(n.href))) ?? NAV[0];
}

/** Coque du back-office : barre latérale sombre, en-tête collant, garde d'authentification. */
export function Shell({ children }: { children: ReactNode }) {
  const { status, user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const api = useAdmin();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const counts = useQuery({ queryKey: ['nav-counts'], queryFn: api.navCounts, enabled: status === 'authenticated', refetchInterval: 60_000 });
  const env = useQuery({ queryKey: ['environment'], queryFn: () => api.overview(7), enabled: status === 'authenticated', staleTime: Infinity, select: (o) => o.environment });

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (status !== 'authenticated' || !user)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} />
      </div>
    );

  const current = activeNav(pathname);
  const envChip = ENV_CHIP[env.data ?? ''] ?? null;
  const name = user.fullName ?? user.email;
  const parts = name.split(/\s+/);
  const shortName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 244, flexShrink: 0, background: C.ink, color: '#fff', position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '22px 14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px 22px' }}>
          <Logo size={32} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1 }}>Rekonect</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(255,255,255,.45)' }}>BACK-OFFICE</div>
          </div>
        </div>
        <nav aria-label="Navigation principale" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV.map((n) => {
            const on = n.id === current.id;
            const badge = n.id === 'rewards' ? (counts.data?.pendingOffers ?? 0) : 0;
            return (
              <div key={n.id} style={{ display: 'contents' }}>
                {'section' in n && n.section && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.13em', color: 'rgba(255,255,255,.35)', padding: '16px 10px 7px' }}>{n.section}</div>}
                <button
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => router.push(n.href)}
                  style={{ height: 38, padding: '0 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 11, fontSize: 13, fontWeight: 600, background: on ? 'rgba(255,255,255,.1)' : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,.62)' }}
                >
                  <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderRadius: n.shape, flexShrink: 0, opacity: 0.9 }} />
                  <span style={{ flex: 1 }}>{n.label}</span>
                  {badge > 0 && <CountBadge>{badge}</CountBadge>}
                </button>
              </div>
            );
          })}
        </nav>
        <div style={{ position: 'relative' }}>
          {menu && (
            <div role="menu" style={{ position: 'absolute', bottom: 56, left: 0, right: 0, background: '#fff', color: C.ink, borderRadius: 14, padding: 6, boxShadow: '0 20px 40px -16px rgba(0,0,0,.5)' }}>
              <div style={{ padding: '8px 10px', fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  await logout();
                  router.replace('/login');
                }}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.redText }}
              >
                Se déconnecter
              </button>
            </div>
          )}
          <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{initialsOf(name)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>Administrateur</div>
            </div>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 64, position: 'sticky', top: 0, zIndex: 20, background: 'rgba(246,244,241,.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(22,24,43,.08)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 36px' }}>
          <div style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.muted }}>
            Back-office <span style={{ margin: '0 6px' }}>/</span> <span style={{ color: C.ink, fontWeight: 700 }}>{current.id === 'overview' ? "Vue d'ensemble" : current.label}</span>
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => setSearch(true)} aria-label="Rechercher" style={{ width: 280, maxWidth: '32vw', height: 38, borderRadius: 11, background: '#fff', border: '1px solid rgba(22,24,43,.1)', display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${C.muted}`, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.muted, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>Famille, activité, partenaire…</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, border: '1px solid rgba(22,24,43,.12)', borderRadius: 6, padding: '1px 6px' }}>⌘K</span>
          </button>
          {envChip && (
            <div style={{ height: 30, padding: '0 11px', borderRadius: 999, background: envChip.bg, color: envChip.fg, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: envChip.dot }} />
              {envChip.label}
            </div>
          )}
        </header>
        <div style={{ padding: '30px 36px 72px', width: '100%', maxWidth: 1380 }}>{children}</div>
      </main>
      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}

/** Recherche ⌘K : familles, activités, partenaires. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useAdmin();
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(t);
  }, [term]);
  const res = useQuery({ queryKey: ['search', debounced], queryFn: () => api.search(debounced), enabled: open && debounced.length >= 2 });
  const go = (href: string) => {
    onClose();
    setTerm('');
    router.push(href);
  };
  const groups = res.data
    ? [
        { title: 'FAMILLES', items: res.data.families.map((f) => ({ id: f.id, label: f.name, sub: f.subtitle, href: `/families?id=${f.id}` })) },
        { title: 'ACTIVITÉS', items: res.data.activities.map((a) => ({ id: a.id, label: a.title, sub: '', href: `/activities?id=${a.id}` })) },
        { title: 'PARTENAIRES', items: res.data.partners.map((p) => ({ id: p.id, label: p.name, sub: '', href: `/partners?id=${p.id}` })) },
      ].filter((g) => g.items.length)
    : [];
  return (
    <Modal open={open} title="Rechercher" onClose={onClose} width={560}>
      <TextInput autoFocus aria-label="Recherche" placeholder="Famille, activité, partenaire…" value={term} onChange={(e) => setTerm(e.target.value)} />
      <div style={{ marginTop: 14, minHeight: 60 }}>
        {res.isFetching && <Spinner />}
        {debounced.length >= 2 && res.data && groups.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>Aucun résultat pour « {debounced} ».</div>}
        {groups.map((g) => (
          <div key={g.title} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.muted, marginBottom: 6 }}>
              {g.title} · {formatNumber(g.items.length)}
            </div>
            {g.items.map((i) => (
              <button key={i.id} type="button" className="rk-row" onClick={() => go(i.href)} style={{ width: '100%', display: 'block', padding: '9px 10px', borderRadius: 10 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{i.label}</span>
                {i.sub && <span style={{ display: 'block', fontSize: 12, color: C.muted }}>{i.sub}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
