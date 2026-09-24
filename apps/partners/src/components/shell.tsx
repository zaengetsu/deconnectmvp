'use client';
import { initialsOf } from '@rekonect/api-client';
import { C, Logo, SoftPanel, Spinner, useSession } from '@rekonect/ui';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { placesCopy } from '@/lib/labels';
import { PartnerProvider, usePartner, usePartnerApi } from '@/lib/partner';

export const NAV = [
  { id: 'dash', href: '/dashboard', label: 'Tableau de bord', shape: '3px', min: 1 },
  { id: 'offers', href: '/offers', label: 'Offres', shape: '50%', min: 1 },
  { id: 'audience', href: '/audience', label: 'Audience & zones', shape: '50% 50% 3px 3px', min: 1 },
  { id: 'stores', href: '/places', label: 'Lieux', shape: '3px 50% 3px 50%', min: 1 },
  { id: 'redeem', href: '/redeem', label: 'Bons & échanges', shape: '2px', min: 0 },
  { id: 'billing', href: '/billing', label: 'Compte & facturation', shape: '3px 3px 50% 50%', min: 3 },
] as const;
const RANK: Record<string, number> = { reception: 0, viewer: 1, editor: 2, owner: 3 };

export const TITLES: Record<string, string> = { dash: 'Tableau de bord', offers: 'Offres', create: 'Nouvelle offre', edit: 'Offre', audience: 'Audience & zones', stores: 'Lieux', redeem: 'Bons & échanges', billing: 'Compte & facturation' };

export function screenOf(pathname: string): string {
  if (pathname === '/offers/new') return 'create';
  if (pathname.startsWith('/offers/')) return 'edit';
  return NAV.find((n) => pathname.startsWith(n.href))?.id ?? 'dash';
}

/** Libellé de portée affiché dans l'en-tête (« National · 142 magasins », « Rayon 15 km · Lyon »…). */
export function scopeLabel(d: { kind: string; plan: { limits: Record<string, unknown> }; stores: unknown[]; _count: { places: number } } | null, city?: string | null) {
  if (!d) return '';
  const limits = d.plan.limits;
  if (d.kind === 'cse') return "Salariés · code d'accès CSE";
  if (d.kind === 'public_institution') return `Habitants${city ? ` · ${city}` : ''}`;
  if (limits.nationalTargeting) {
    const n = d.stores.length || d._count.places;
    return `National · ${n} ${d.kind === 'brand' ? `magasin${n > 1 ? 's' : ''}` : `lieu${n > 1 ? 'x' : ''}`}`;
  }
  return `Rayon ${limits.maxRadiusKm ?? 20} km${city ? ` · ${city}` : ''}`;
}

export function Shell({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);
  if (status !== 'authenticated')
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} />
      </div>
    );
  return (
    <PartnerProvider>
      <Frame>{children}</Frame>
    </PartnerProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const { accounts, account, detail, setAccount, loading, error, can, partnerId } = usePartner();
  const api = usePartnerApi();
  const router = useRouter();
  const pathname = usePathname();
  const [sw, setSw] = useState(false);
  const [menu, setMenu] = useState(false);
  const offers = useQuery({ queryKey: ['offers', partnerId, 'all'], queryFn: () => api.offers(partnerId!), enabled: !!partnerId && can.view });
  const places = useQuery({ queryKey: ['places', partnerId], queryFn: () => api.places(partnerId!), enabled: !!partnerId && can.view });

  if (loading)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} />
      </div>
    );
  if (error || !account)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Aucun compte partenaire actif</div>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>Votre accès a peut-être été retiré. Contactez le responsable de votre compte ou l’équipe Rekonect.</p>
          <button type="button" onClick={() => void logout().then(() => router.replace('/login'))} style={{ fontWeight: 700, color: C.primary }}>
            Se déconnecter
          </button>
        </div>
      </div>
    );

  const role = detail?.myRole ?? account.role;
  const screen = screenOf(pathname);
  const copy = placesCopy(detail);
  const title = screen === 'stores' ? copy.title : TITLES[screen];
  const first = (user?.fullName ?? user?.email ?? '').split(/\s+/)[0];
  const city = places.data?.[0]?.city ?? null;
  const typeLine = detail ? `${detail.kindLabel}${detail.parentPartner ? ` · rattaché à ${detail.parentPartner.name}` : ` · plan ${detail.plan.name}`}` : account.kindLabel;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 256, flexShrink: 0, background: '#fff', borderRight: '1px solid rgba(22,24,43,.08)', position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: '20px 14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
          <Logo size={28} first={C.primary} />
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.03em' }}>Rekonect</div>
          <div style={{ height: 20, padding: '0 7px', borderRadius: 6, background: '#FFEDE4', color: '#C2582A', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', display: 'flex', alignItems: 'center' }}>PARTENAIRES</div>
        </div>

        <div style={{ position: 'relative', marginBottom: 18 }}>
          <button type="button" aria-haspopup="listbox" aria-expanded={sw} onClick={() => setSw((s) => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 14, background: '#F6F4F1', border: '1px solid rgba(22,24,43,.08)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: account.color, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{account.initials}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeLine}</span>
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>▾</span>
          </button>
          {sw && (
            <div role="listbox" aria-label="Changer de compte" style={{ position: 'absolute', top: 62, left: 0, right: 0, zIndex: 40, background: '#fff', border: '1px solid rgba(22,24,43,.1)', borderRadius: 14, boxShadow: '0 20px 40px -16px rgba(22,24,43,.3)', padding: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: C.muted, padding: '8px 10px 6px' }}>CHANGER DE COMPTE</div>
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={a.id === account.id}
                  onClick={() => {
                    setAccount(a.id);
                    setSw(false);
                    router.push('/dashboard');
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: a.id === account.id ? '#F6F4F1' : 'transparent' }}
                >
                  <span style={{ width: 28, height: 28, borderRadius: 9, background: a.color, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.initials}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700 }}>{a.name}</span>
                    <span style={{ display: 'block', fontSize: 10, color: C.muted }}>{a.subtitle ?? a.kindLabel}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {can.edit && (
          <button type="button" onClick={() => router.push('/offers/new')} style={{ height: 42, borderRadius: 999, background: C.coral, color: C.ink, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, boxShadow: '0 8px 20px -10px rgba(255,148,105,.9)' }}>
            + Créer une offre
          </button>
        )}

        <nav aria-label="Navigation principale" style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV.filter((n) => RANK[role] >= n.min).map((n) => {
            const on = screen === n.id || (n.id === 'offers' && (screen === 'create' || screen === 'edit'));
            const count = n.id === 'offers' ? (offers.data?.length ?? 0) : 0;
            return (
              <button key={n.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => router.push(n.href)} style={{ height: 38, padding: '0 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 11, fontSize: 13, fontWeight: 700, background: on ? '#F1EEE9' : 'transparent', color: on ? C.ink : C.text2 }}>
                <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderRadius: n.shape, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{n.id === 'stores' ? copy.title : n.label}</span>
                {count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{count}</span>}
              </button>
            );
          })}
        </nav>

        <SoftPanel title="Données anonymisées">Vous voyez des volumes agrégés par zone. Aucune donnée nominative d'enfant n'est partagée.</SoftPanel>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <header style={{ height: 64, position: 'sticky', top: 0, zIndex: 20, background: 'rgba(246,244,241,.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(22,24,43,.08)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 36px' }}>
          <div style={{ flex: '0 1 auto', minWidth: 0, fontSize: 13, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {account.name} <span style={{ margin: '0 6px' }}>/</span> <span style={{ color: C.ink, fontWeight: 700 }}>{title}</span>
          </div>
          <div style={{ flex: '1 1 0' }} />
          {detail && (
            <div style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 999, background: '#fff', border: '1px solid rgba(22,24,43,.1)', fontSize: 12, fontWeight: 700, color: C.text2, display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${C.primary}` }} />
              {scopeLabel(detail, city)}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button type="button" aria-label="Mon compte" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} style={{ width: 34, height: 34, borderRadius: '50%', background: C.ink, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initialsOf(user?.fullName ?? user?.email)}
            </button>
            {menu && (
              <div role="menu" style={{ position: 'absolute', right: 0, top: 42, width: 220, background: '#fff', border: '1px solid rgba(22,24,43,.1)', borderRadius: 14, boxShadow: '0 20px 40px -16px rgba(22,24,43,.3)', padding: 6 }}>
                <div style={{ padding: '8px 10px', fontSize: 12, color: C.muted }}>
                  {first ? `${first} · ` : ''}
                  {user?.email}
                </div>
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
          </div>
        </header>
        <div style={{ padding: '30px 36px 72px', width: '100%', maxWidth: 1380 }}>{children}</div>
      </main>
    </div>
  );
}
