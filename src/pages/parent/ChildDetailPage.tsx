import { pauseCircleOutline, qrCodeOutline } from 'ionicons/icons';
import RkTile from '../../components/rk/RkTile';
import { useRkBack } from '../../hooks/useRkBack';
import { buildChildLinkUrl } from '../../lib/childLink';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { gamificationService, getRealStreak } from '../../features/gamification/gamification.service';
import { useRk, RkSheet } from '../../components/rk/RkShell';
import { LEVEL_NAMES } from '../../lib/constants';
import type { Child, ChildActivity, ChildBadge } from '../../types/database.types';

/** Fiche enfant — porté de la maquette Rekonect (écran pKid). */

const BADGE_TINTS = ['var(--rk-ambersoft)', 'var(--rk-sagesoft)', 'var(--rk-accentsoft)', 'var(--rk-indigosoft)'];

const isWithinLastDay = (iso?: string | null) =>
  !!iso && Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

const ChildDetailPage: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const history = useHistory();
  const back = useRkBack('/parent/children');
  const { sheet, openSheet, closeSheet } = useRk();

  const [child, setChild] = useState<Child | null>(null);
  const [activities, setActivities] = useState<ChildActivity[]>([]);
  const [badges, setBadges] = useState<ChildBadge[]>([]);
  const [stats, setStats] = useState<{ totalEarned: number; totalSpent: number; activitiesValidated: number } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);

  const load = () => {
    childrenService.getChild(childId).then(setChild).catch(e => console.error('[pKid]', e));
    activitiesService.getChildActivities(childId).then(a => setActivities(a.slice(0, 6))).catch(() => {});
    gamificationService.getChildBadges(childId).then(b => setBadges(b.slice(0, 8))).catch(() => {});
    gamificationService.getAllTimeStats(childId).then(setStats).catch(() => {});
  };

  useEffect(load, [childId]);
  useIonViewWillEnter(load);

  const createLink = async () => {
    try {
      const { data, error } = await supabase.rpc('create_child_link_token', { p_child_id: childId });
      if (error) throw error;
      const payload = typeof data === 'string' ? { token: data } : (data as { token?: string; code?: string } | null);
      setToken(payload?.token ?? null);
      setCode(payload?.code ?? null);
      setPin(String(Math.floor(1000 + Math.random() * 9000)));
      openSheet('qr');
    } catch (e) {
      console.error('[pKid] link:', e);
    }
  };

  if (!child) {
    return <IonPage><IonContent><div className="rk-app" style={{ padding: 40 }}>Chargement…</div></IonContent></IonPage>;
  }

  const level = gamificationService.calculateLevel(child.total_points);
  const levelName = LEVEL_NAMES[level - 1]?.name ?? 'Graine';
  const nextThreshold = gamificationService.getNextLevelThreshold(child.total_points);
  const progress = gamificationService.getLevelProgress(child.total_points);
  const streak = getRealStreak(child.streak_days || 0, child.last_activity_date);
  const linked = !!child.auth_user_id;
  // La confirmation « Appareil lié » n'est mise en avant que dans les 24 h qui
  // suivent la liaison ; ensuite, un simple statut discret dans l'en-tête.
  const justLinked = linked && isWithinLastDay(child.device_linked_at);
  const isImg = child.avatar_url?.startsWith('/images/avatars/');

  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 12,
  };

  const statusOf = (ca: ChildActivity) => {
    if (ca.status === 'submitted') return { dot: 'var(--rk-amber)', label: 'En attente de validation', points: `${ca.activity?.points ?? 0} pts`, color: 'var(--rk-text3)' };
    if (ca.status === 'validated') return { dot: 'var(--rk-sage)', label: 'Validée', points: `+${ca.earned_points ?? 0} pts`, color: 'var(--rk-sage)' };
    if (ca.status === 'rejected') return { dot: 'var(--rk-rasp)', label: 'Non validée', points: '—', color: 'var(--rk-text3)' };
    return { dot: 'var(--rk-text3)', label: 'En cours', points: `${ca.activity?.points ?? 0} pts`, color: 'var(--rk-text3)' };
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        {/* ── En-tête indigo ──────────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 12px) 22px 26px',
          background: 'var(--rk-indigo)',
          backgroundImage:
            'radial-gradient(circle at 15% 120%, rgba(255,255,255,.14) 0 44%, transparent 45%),' +
            'radial-gradient(circle at 15% 120%, rgba(255,255,255,.1) 66%, transparent 67%)',
          color: '#fff',
        }}>
          <button onClick={back} style={{
            height: 32, padding: '0 13px', borderRadius: 999, background: 'rgba(255,255,255,.18)',
            color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20,
          }}>← Enfants</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {isImg ? (
              <img src={child.avatar_url!} alt="" style={{
                width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
                border: '3px solid rgba(255,255,255,.35)', flexShrink: 0, background: '#EDE7FF',
              }} />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: '50%', border: '3px solid rgba(255,255,255,.35)',
                background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 26, fontWeight: 800, flexShrink: 0,
              }}>{child.display_name[0]?.toUpperCase()}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.03em', margin: 0 }}>
                {child.display_name}
              </h1>
              <div style={{ fontSize: 13, opacity: .8, marginTop: 3 }}>
                {child.age} ans · {levelName}
                {streak > 0 ? ` · série de ${streak} jour${streak > 1 ? 's' : ''}` : ''}
                {linked && !justLinked ? ' · appareil relié' : ''}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, opacity: .85, marginBottom: 7 }}>
              <span>Niveau {level}</span><span>{child.total_points} / {nextThreshold} pts</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: '#fff' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button onClick={() => history.push(`/parent/children/${childId}/assign`)} style={{
              flex: 1, height: 42, borderRadius: 999, background: '#fff', color: 'var(--rk-indigo)',
              fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>Assigner</button>
            {!linked && (
              <button onClick={createLink} style={{
                flex: 1, height: 42, borderRadius: 999, background: 'rgba(255,255,255,.18)', color: '#fff',
                fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>Relier son téléphone</button>
            )}
            <button onClick={() => openSheet('more')} aria-label="Plus d'options" style={{
              width: 42, height: 42, borderRadius: 999, background: 'rgba(255,255,255,.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <div style={{ width: 15, height: 15, borderRadius: 4, border: '2px solid #fff' }} />
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Appareil : appel à l'action tant qu'il n'est pas relié, confirmation
                 pendant 24 h après la liaison, puis rien (statut dans l'en-tête). ── */}
          {(!linked || justLinked) && (
          <button onClick={linked ? undefined : createLink} disabled={linked} style={{
            display: 'flex', alignItems: 'center', gap: 13, borderRadius: 18, padding: 15, width: '100%', textAlign: 'left',
            background: linked ? 'var(--rk-sagesoft)' : 'var(--rk-ambersoft)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12, flexShrink: 0,
              background: linked ? 'var(--rk-sage)' : 'var(--rk-amber)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {linked && (
                <div style={{
                  width: 13, height: 8, borderLeft: '2.5px solid #fff', borderBottom: '2.5px solid #fff',
                  transform: 'rotate(-45deg) translate(1px,-2px)',
                }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>
                {linked ? 'Appareil lié' : 'Appareil non lié'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--rk-text2)', marginTop: 2 }}>
                {linked
                  ? `${child.display_name} se connecte désormais avec son code PIN`
                  : 'Touchez pour afficher le QR code et le code de liaison'}
              </div>
            </div>
            {!linked && <div style={{ fontSize: 16, color: 'var(--rk-text3)', flexShrink: 0 }}>›</div>}
          </button>
          )}

          {/* ── Depuis le début ───────────────────────────────── */}
          <div>
            <div style={eyebrow}>DEPUIS LE DÉBUT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--rk-sage)', letterSpacing: '-.03em' }}>
                  +{stats?.totalEarned ?? 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>Points gagnés</div>
              </div>
              <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--rk-rasp)', letterSpacing: '-.03em' }}>
                  −{stats?.totalSpent ?? 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>Points utilisés</div>
              </div>
              <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.03em' }}>
                  {stats?.activitiesValidated ?? 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>Activités validées</div>
              </div>
            </div>
          </div>

          {/* ── Badges ────────────────────────────────────────── */}
          {badges.length > 0 && (
            <div>
              <div style={eyebrow}>BADGES · {badges.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9 }}>
                {badges.map((b, i) => (
                  <div key={b.id} style={{
                    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                    borderRadius: 16, padding: '12px 8px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 11, margin: '0 auto 7px',
                      background: BADGE_TINTS[i % BADGE_TINTS.length],
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{b.badge?.icon ?? '🏅'}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rk-text)', lineHeight: 1.25 }}>
                      {b.badge?.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Activités récentes ────────────────────────────── */}
          <div>
            <div style={eyebrow}>ACTIVITÉS RÉCENTES</div>
            {activities.length === 0 ? (
              <div style={{
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                borderRadius: 20, padding: '24px 18px', textAlign: 'center',
                fontSize: 14, color: 'var(--rk-text3)',
              }}>
                Aucune activité pour l'instant.
              </div>
            ) : (
              <div style={{
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                borderRadius: 20, overflow: 'hidden',
              }}>
                {activities.map((ca, i) => {
                  const st = statusOf(ca);
                  return (
                    <div key={ca.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                      borderBottom: i === activities.length - 1 ? 'none' : '1px solid var(--rk-line)',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rk-text)' }}>{ca.activity?.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>{st.label}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: st.color, flexShrink: 0 }}>{st.points}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Feuille « plus » ─────────────────────────────────── */}
        <RkSheet open={sheet === 'more'} onClose={closeSheet} eyebrow={child.display_name.toUpperCase()}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { closeSheet(); history.push('/parent/rewards'); }} style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%',
              background: 'var(--rk-surface2)', borderRadius: 16, padding: 15,
            }}>
              <RkTile img="/images/menu/gift.png" tint="var(--rk-accentsoft)" size={38} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>Ses récompenses</div>
                <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>Voir et créer des récompenses</div>
              </div>
            </button>
            <button onClick={() => { closeSheet(); void createLink(); }} style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%',
              background: 'var(--rk-surface2)', borderRadius: 16, padding: 15,
            }}>
              <RkTile icon={qrCodeOutline} tint="var(--rk-indigosoft)" size={38} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>
                  {linked ? 'Relier un autre téléphone' : 'Relier son téléphone'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                  {linked ? 'Nouveau téléphone, ou code PIN oublié' : 'QR code ou code à 6 caractères'}
                </div>
              </div>
            </button>
            <button
              onClick={async () => {
                if (!confirm(`Désactiver le profil de ${child.display_name} ? Ses points sont conservés.`)) return;
                await childrenService.deactivateChild(child.id);
                closeSheet();
                history.replace('/parent/children');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                background: 'var(--rk-surface2)', borderRadius: 16, padding: 15,
              }}
            >
              <RkTile icon={pauseCircleOutline} tint="var(--rk-raspsoft)" size={38} radius={12} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>Désactiver le profil</div>
                <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>Réversible, les points sont conservés</div>
              </div>
            </button>
          </div>
        </RkSheet>

        {/* ── Feuille QR ──────────────────────────────────────── */}
        <RkSheet
          open={sheet === 'qr'}
          onClose={closeSheet}
          title={`Relier l'appareil de ${child.display_name}`}
          subtitle="Sur son téléphone : scannez ce code depuis Rekonect, ou avec l’appareil photo — il ouvrira l’app"
        >
          <div style={{
            background: '#fff', borderRadius: 20, padding: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            {token
              ? <QRCodeSVG value={buildChildLinkUrl(token, code, child.display_name)} size={200} level="M" />
              : <div style={{ color: 'var(--rk-text3)' }}>Génération…</div>}
          </div>
          {code && (
            <div style={{
              textAlign: 'center', marginBottom: 16, padding: '14px 12px', borderRadius: 16,
              background: 'var(--rk-surface2)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>
                OU SAISIR CE CODE
              </div>
              <div style={{
                fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 30, fontWeight: 700,
                letterSpacing: '.22em', color: 'var(--rk-indigo)', marginTop: 6,
              }}>{code.slice(0, 3)} {code.slice(3)}</div>
              <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 6 }}>
                Sur son téléphone : « Entrer un code à la place ». Valable 15 minutes.
              </div>
            </div>
          )}
          {pin && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>
                CODE PIN SUGGÉRÉ
              </div>
              <div style={{
                fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 30, fontWeight: 700,
                letterSpacing: '.2em', color: 'var(--rk-text)', marginTop: 6,
              }}>{pin}</div>
              <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 6 }}>
                Votre enfant le choisira lui-même sur son appareil.
              </div>
            </div>
          )}
          <button onClick={closeSheet} style={{
            width: '100%', height: 50, borderRadius: 999, background: 'var(--rk-indigo)',
            color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>Terminé</button>
        </RkSheet>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildDetailPage;
