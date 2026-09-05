import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { rewardsService } from '../../features/rewards/rewards.service';
import { gamificationService } from '../../features/gamification/gamification.service';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { LEVEL_NAMES } from '../../lib/constants';
import type { Child, ChildActivity, RewardRequest } from '../../types/database.types';

/** Tableau de bord parent — porté de la maquette Rekonect (écran pHome). */

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const avatarOf = (child: Child) =>
  child.avatar_url?.startsWith('/images/avatars/') ? child.avatar_url : null;

const ParentDashboard: React.FC = () => {
  const { profile, user } = useAuthStore();
  const history = useHistory();
  const { count: unread } = useUnreadCount();

  const [children, setChildren] = useState<Child[]>([]);
  const [pending, setPending] = useState<ChildActivity[]>([]);
  const [rewardReqs, setRewardReqs] = useState<RewardRequest[]>([]);
  const [week, setWeek] = useState<{ day: string; count: number; points: number; isToday: boolean }[]>([]);
  const [validatedWeek, setValidatedWeek] = useState(0);

  const fetchAll = () => {
    if (!user) return;
    childrenService.getChildren(user.id).then(async (kids) => {
      setChildren(kids);
      // Semaine agrégée sur l'ensemble de la fratrie
      const perChild = await Promise.all(
        kids.map(k => gamificationService.getWeeklyDayByDay(k.id).catch(() => [])),
      );
      const merged = DAY_LABELS.map((day, i) => {
        let count = 0, points = 0, isToday = false;
        perChild.forEach(days => {
          const d = days[i];
          if (!d) return;
          count += d.count; points += d.points; isToday = isToday || d.isToday;
        });
        return { day, count, points, isToday };
      });
      setWeek(merged);
      setValidatedWeek(merged.reduce((s, d) => s + d.count, 0));
    }).catch(e => console.error('[Dashboard] children:', e));

    activitiesService.getPendingValidations(user.id).then(setPending).catch(e => console.error('[Dashboard] pending:', e));
    rewardsService.getPendingRewardRequests(user.id).then(setRewardReqs).catch(e => console.error('[Dashboard] rewards:', e));
  };

  useEffect(() => { if (user) fetchAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);
  useIonViewWillEnter(fetchAll);

  const firstName = profile?.full_name?.split(' ')[0] || 'Parent';
  const initial = firstName[0]?.toUpperCase() ?? 'P';
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const weekPoints = week.reduce((s, d) => s + d.points, 0);
  const maxPoints = Math.max(1, ...week.map(d => d.points));
  const activeDays = week.filter(d => d.count > 0).length;
  const quietDay = week.reduce((min, d) => (d.count < min.count ? d : min), week[0] ?? { day: '', count: 0 });
  const QUIET_NAMES: Record<string, string> = { L: 'lundi', M: 'mardi', J: 'jeudi', V: 'vendredi', S: 'samedi', D: 'dimanche' };

  const pendingNames = [...new Set(pending.map(p => p.child?.display_name).filter(Boolean))] as string[];
  const pendingAvatars = children.filter(c => pendingNames.includes(c.display_name)).slice(0, 3);

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        {/* ── En-tête ─────────────────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--rk-text3)' }}>{today}</div>
              <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: '4px 0 0', color: 'var(--rk-text)' }}>
                Bonjour {firstName}
              </h1>
            </div>
            <button onClick={() => history.push('/parent/notifications')} aria-label="Notifications" style={{
              width: 40, height: 40, borderRadius: 13, background: 'var(--rk-surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative',
            }}>
              <div style={{ width: 15, height: 15, borderRadius: '5px 5px 2px 2px', border: '2px solid var(--rk-text2)' }} />
              {unread > 0 && (
                <div style={{
                  position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: '50%',
                  background: '#E0A233', border: '1.5px solid var(--rk-surface2)',
                }} />
              )}
            </button>
            <button onClick={() => history.push('/parent/settings')} aria-label="Réglages" style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--rk-indigo)', color: 'var(--rk-indigofg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0,
            }}>{initial}</button>
          </div>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── À faire maintenant ────────────────────────────── */}
          {pending.length > 0 && (
            <button onClick={() => history.push('/parent/validations')} style={{
              display: 'block', width: '100%', borderRadius: 22, padding: 20,
              background: 'var(--rk-indigo)',
              backgroundImage:
                'radial-gradient(circle at 88% 130%, rgba(255,255,255,.16) 0 42%, transparent 43%),' +
                'radial-gradient(circle at 88% 130%, rgba(255,255,255,.12) 62%, transparent 63%)',
              color: '#fff', boxShadow: '0 14px 30px -14px var(--rk-navshadow)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', opacity: .75 }}>À FAIRE MAINTENANT</div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.025em', marginTop: 8 }}>
                {pending.length} activité{pending.length > 1 ? 's' : ''} attend{pending.length > 1 ? 'ent' : ''}<br />votre validation
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
                <div style={{ display: 'flex' }}>
                  {pendingAvatars.map((c, i) => (
                    avatarOf(c)
                      ? <img key={c.id} src={avatarOf(c)!} alt="" style={{
                          width: 28, height: 28, borderRadius: '50%', objectFit: 'cover',
                          border: '2px solid var(--rk-indigo)', background: '#EDE7FF',
                          marginLeft: i === 0 ? 0 : -9,
                        }} />
                      : <div key={c.id} style={{
                          width: 28, height: 28, borderRadius: '50%', background: '#EDE7FF', color: 'var(--rk-indigo)',
                          border: '2px solid var(--rk-indigo)', marginLeft: i === 0 ? 0 : -9,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                        }}>{c.display_name[0]?.toUpperCase()}</div>
                  ))}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, opacity: .9 }}>
                  {pendingNames.slice(0, 2).join(' et ') || 'Vos enfants'}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800 }}>Ouvrir →</span>
              </div>
            </button>
          )}

          {/* ── Trois compteurs ───────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px' }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-text)' }}>{children.length}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rk-text3)', marginTop: 2, lineHeight: 1.3 }}>Enfants</div>
            </div>
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px' }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-sage)' }}>{validatedWeek}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rk-text3)', marginTop: 2, lineHeight: 1.3 }}>Validées<br />cette semaine</div>
            </div>
            <div
              onClick={() => history.push('/parent/rewards')}
              style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px', cursor: 'pointer' }}
            >
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--rk-amber)' }}>{rewardReqs.length}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rk-text3)', marginTop: 2, lineHeight: 1.3 }}>
                Demande{rewardReqs.length > 1 ? 's' : ''} de<br />récompense
              </div>
            </div>
          </div>

          {/* ── Mes enfants ───────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>MES ENFANTS</div>
              <button onClick={() => history.push('/parent/children')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-indigo)' }}>
                Tout voir
              </button>
            </div>

            {children.length === 0 ? (
              <button onClick={() => history.push('/parent/create-child')} style={{
                width: '100%', background: 'var(--rk-surface)', border: '1px dashed var(--rk-border)',
                borderRadius: 18, padding: '26px 18px', textAlign: 'center',
                fontSize: 14, color: 'var(--rk-text3)',
              }}>
                Ajoutez votre premier enfant
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {children.map(child => {
                  const level = child.level ?? 1;
                  const levelName = LEVEL_NAMES[level - 1]?.name ?? '';
                  const progress = gamificationService.getLevelProgress(child.total_points);
                  return (
                    <button key={child.id} onClick={() => history.push(`/parent/children/${child.id}`)} style={{
                      display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                      background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                      borderRadius: 18, padding: 14,
                    }}>
                      {avatarOf(child)
                        ? <img src={avatarOf(child)!} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#EDE7FF' }} />
                        : <div style={{
                            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                            background: /^#[0-9A-Fa-f]{3,8}$/.test(child.avatar_url || '') ? child.avatar_url! : '#EDE7FF',
                            color: 'var(--rk-indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 800,
                          }}>{child.display_name[0]?.toUpperCase()}</div>}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)', letterSpacing: '-.01em' }}>
                          {child.display_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                          {child.age} ans{levelName ? ` · ${levelName}` : ''} · niveau {level}
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: 'var(--rk-surface2)', overflow: 'hidden', marginTop: 8 }}>
                          <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'var(--rk-accent)' }} />
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)', fontVariantNumeric: 'tabular-nums' }}>
                          {child.total_points}
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rk-text3)' }}>PTS</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Cette semaine ─────────────────────────────────── */}
          {week.length > 0 && (
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 20, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>CETTE SEMAINE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-sage)' }}>+{weekPoints} pts</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 76 }}>
                {week.map((d, i) => {
                  const h = d.points === 0 ? 8 : Math.max(14, Math.round((d.points / maxPoints) * 66));
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <div style={{
                        width: '100%', height: h, borderRadius: 7,
                        background: d.points === 0 ? 'var(--rk-surface2)' : (d.isToday ? 'var(--rk-indigo)' : 'var(--rk-accent)'),
                        opacity: d.points === 0 || d.isToday ? 1 : .5 + Math.min(.4, d.points / maxPoints * .4),
                      }} />
                      <span style={{ fontSize: 10, fontWeight: d.isToday ? 800 : 700, color: d.isToday ? 'var(--rk-indigo)' : 'var(--rk-text3)' }}>
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rk-line)', fontSize: 12, color: 'var(--rk-text2)', lineHeight: 1.5 }}>
                {activeDays} jour{activeDays > 1 ? 's' : ''} actif{activeDays > 1 ? 's' : ''} sur 7.
                {quietDay && quietDay.count === 0 ? ` Le ${QUIET_NAMES[quietDay.day] ?? 'mercredi'} reste le jour le plus creux.` : ''}
              </div>
            </div>
          )}

          {/* ── Raccourcis ────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 12 }}>RACCOURCIS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => history.push('/parent/activities')} style={{
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: 16,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12, background: 'var(--rk-indigosoft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}>
                  <img src="/images/categories/books.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text)' }}>Catalogue</div>
                <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>Activités prêtes à assigner</div>
              </button>

              <button onClick={() => history.push(children[0] ? `/parent/children/${children[0].id}/assign` : '/parent/children')} style={{
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: 16,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12, background: 'var(--rk-accentsoft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
                }}>
                  <img src="/images/categories/calendar.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text)' }}>Assigner</div>
                <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>Semaine à venir</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ParentDashboard;
