import { useRkBack, useBackSwipe } from '../../hooks/useRkBack';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth.store';
import { RkShell, RkSheet } from '../../components/rk/RkShell';

/** Ma famille — porté de la maquette Rekonect (écran pFamily). */

const MEMBER_ROLES = [
  { value: 'co_parent',   label: 'Co-parent' },
  { value: 'educator',    label: 'Éducateur·rice' },
  { value: 'grandparent', label: 'Grand-parent' },
  { value: 'babysitter',  label: 'Baby-sitter' },
] as const;

type MemberRole = typeof MEMBER_ROLES[number]['value'];

interface FamilyMember {
  id: string;
  member_email: string;
  member_role: MemberRole;
  status: 'pending' | 'active' | 'revoked';
  joined_at: string | null;
}

const ROLE_LABEL: Record<string, string> = Object.fromEntries(MEMBER_ROLES.map(r => [r.value, r.label]));

const FamilyPageInner: React.FC = () => {
  const { user, profile } = useAuthStore();
  const back = useRkBack('/parent/settings');
  const backSwipe = useBackSwipe(back);

  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [role, setRole] = useState<MemberRole>('co_parent');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('owner_id', user.id)
      .neq('status', 'revoked');
    setMembers((data as FamilyMember[]) ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user) return;
      const { data } = await supabase
        .from('family_members')
        .select('*')
        .eq('owner_id', user.id)
        .neq('status', 'revoked');
      if (!cancelled) setMembers((data as FamilyMember[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const createInvite = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_family_invitation', {
        p_member_role: role,
        p_invite_email: email || null,
      });
      if (error) throw error;
      setToken(typeof data === 'string' ? data : (data as { token?: string })?.token ?? null);
      load();
    } catch (e) {
      console.error('[pFamily] invite:', e);
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papier indisponible */ }
  };

  const share = async () => {
    if (!token) return;
    const text = `Rejoins notre famille sur Rekonect avec le code ${token}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* partage annulé */ }
    }
    copyCode();
  };

  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 12,
  };

  const ownerName = profile?.full_name || 'Vous';
  const active = members.filter(m => m.status === 'active');
  const pending = members.filter(m => m.status === 'pending');
  const total = active.length + 1;

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }} {...backSwipe}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={back} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← Réglages</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Ma famille
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            Co-parent, grands-parents, éducateur
          </p>
        </div>

        <div style={{ padding: '18px 22px 60px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          <div>
            <div style={eyebrow}>MEMBRES · {total}</div>
            <div style={{
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              borderRadius: 20, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px',
                borderBottom: active.length + pending.length > 0 ? '1px solid var(--rk-line)' : 'none',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'var(--rk-indigo)',
                  color: 'var(--rk-indigofg)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0,
                }}>{ownerName[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{ownerName}</div>
                  <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>{profile?.email}</div>
                </div>
                <div style={{
                  height: 26, padding: '0 10px', borderRadius: 999, background: 'var(--rk-indigosoft)',
                  color: 'var(--rk-indigo)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', flexShrink: 0,
                }}>Admin</div>
              </div>

              {[...active, ...pending].map((m, i, arr) => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px',
                  borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--rk-line)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: 'var(--rk-surface2)',
                    color: 'var(--rk-text2)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0,
                  }}>{m.member_email?.[0]?.toUpperCase() ?? '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{m.member_email}</div>
                    <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {m.status === 'pending' ? 'Invitation envoyée' : 'Peut valider les activités'}
                    </div>
                  </div>
                  <div style={{
                    height: 26, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                    background: m.status === 'pending' ? 'var(--rk-ambersoft)' : 'var(--rk-surface2)',
                    color: m.status === 'pending' ? 'var(--rk-amber)' : 'var(--rk-text2)',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                  }}>
                    {ROLE_LABEL[m.member_role] ?? 'Membre'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Code d'invitation ─────────────────────────────── */}
          {token ? (
            <div style={{
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              borderRadius: 20, padding: 20, textAlign: 'center',
            }}>
              <div style={eyebrow}>CODE D'INVITATION</div>
              <div style={{
                fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 32, fontWeight: 700,
                letterSpacing: '.16em', color: 'var(--rk-text)', wordBreak: 'break-all',
              }}>{token}</div>
              <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 8 }}>Valable 48 heures</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button onClick={share} style={{
                  flex: 1, height: 44, borderRadius: 999, background: 'var(--rk-indigo)',
                  color: 'var(--rk-indigofg)', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>Partager</button>
                <button onClick={copyCode} style={{
                  width: 100, height: 44, borderRadius: 999, border: '1.5px solid var(--rk-border)',
                  color: 'var(--rk-text)', fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{copied ? 'Copié' : 'Copier'}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setSheetOpen(true)} style={{
              width: '100%', height: 52, borderRadius: 999, border: '1.5px dashed var(--rk-border)',
              color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}>
              <span style={{ fontSize: 19, lineHeight: 1 }}>+</span> Inviter quelqu'un
            </button>
          )}
        </div>

        <RkSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Inviter quelqu'un"
          subtitle="Cette personne pourra suivre et valider les activités"
        >
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {MEMBER_ROLES.map(r => (
              <button key={r.value} onClick={() => setRole(r.value)} style={{
                height: 34, padding: '0 13px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: role === r.value ? 'var(--rk-indigosoft)' : 'var(--rk-surface2)',
                color: role === r.value ? 'var(--rk-indigo)' : 'var(--rk-text2)',
                display: 'flex', alignItems: 'center',
              }}>{r.label}</button>
            ))}
          </div>

          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Adresse email (facultatif)"
            style={{
              width: '100%', height: 50, borderRadius: 16, border: '1.5px solid var(--rk-border)',
              background: 'var(--rk-surface)', padding: '0 15px', fontSize: 15,
              fontFamily: 'inherit', color: 'var(--rk-text)', marginBottom: 16,
            }}
          />

          <button onClick={() => { createInvite(); setSheetOpen(false); }} disabled={creating} style={{
            width: '100%', height: 52, borderRadius: 999, background: 'var(--rk-indigo)',
            color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: creating ? .6 : 1,
          }}>
            {creating ? 'Création…' : "Créer le code d'invitation"}
          </button>
        </RkSheet>
      </div>
    </IonContent></IonPage>
  );
};

/** La page est atteignable hors des onglets parent : elle porte sa propre coquille. */
const FamilyPage: React.FC = () => (
  <RkShell space="parent"><FamilyPageInner /></RkShell>
);

export default FamilyPage;
