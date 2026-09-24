import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { gamificationService, getRealStreak } from '../../features/gamification/gamification.service';
import { activitiesService } from '../../features/activities/activities.service';
import { rewardsService } from '../../features/rewards/rewards.service';
import { notificationService } from '../../features/notifications/notification.service';
import { LEVEL_NAMES } from '../../lib/constants';
import { getCategoryStyle } from '../../lib/categoryStyle';
import type { ChildActivity, Reward } from '../../types/database.types';

/** Accueil enfant — porté de la maquette Rekonect (écran cHome). */

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const ChildHomePage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const history = useHistory();

  const [week, setWeek] = useState<{ day: string; count: number; points: number; isToday: boolean }[]>([]);
  const [today, setToday] = useState<ChildActivity[]>([]);
  const [stats, setStats] = useState<{ totalEarned: number; totalSpent: number; activitiesValidated: number } | null>(null);
  const [nextReward, setNextReward] = useState<Reward | null>(null);
  const [unread, setUnread] = useState(0);

  const load = () => {
    if (!selectedChild) return;
    const id = selectedChild.id;

    gamificationService.getWeeklyDayByDay(id)
      .then(days => setWeek(days.map((d, i) => ({ day: DAY_LABELS[i] ?? d.day, count: d.count, points: d.points, isToday: d.isToday }))))
      .catch(() => {});

    activitiesService.getChildActivities(id)
      .then(all => setToday(all.filter(ca => ca.status === 'selected' || ca.status === 'submitted').slice(0, 3)))
      .catch(() => {});

    gamificationService.getAllTimeStats(id).then(setStats).catch(() => {});
    notificationService.getUnreadCount('child', id).then(setUnread).catch(() => {});

    rewardsService.getChildRewards(selectedChild.parent_id, id)
      .then(rewards => {
        const locked = rewards
          .filter(r => r.required_points > selectedChild.total_points)
          .sort((a, b) => a.required_points - b.required_points);
        setNextReward(locked[0] ?? null);
      })
      .catch(() => {});
  };

  useEffect(load, [selectedChild?.id]);
  useIonViewWillEnter(load);

  if (!selectedChild) {
    return (
      <IonPage><IonContent>
        <div className="rk-app" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)' }}>Aucun profil sélectionné</h3>
        </div>
      </IonContent></IonPage>
    );
  }

  const level = gamificationService.calculateLevel(selectedChild.total_points);
  const levelName = LEVEL_NAMES[level - 1]?.name ?? 'Graine';
  const nextLevelName = LEVEL_NAMES[level]?.name;
  const nextThreshold = gamificationService.getNextLevelThreshold(selectedChild.total_points);
  const toNextLevel = Math.max(0, nextThreshold - selectedChild.total_points);
  const progress = gamificationService.getLevelProgress(selectedChild.total_points);
  const streak = getRealStreak(selectedChild.streak_days || 0, selectedChild.last_activity_date);

  const weekPoints = week.reduce((s, d) => s + d.points, 0);
  const maxPoints = Math.max(1, ...week.map(d => d.points));

  const available = stats ? stats.totalEarned - stats.totalSpent : selectedChild.total_points;
  const missing = nextReward ? Math.max(0, nextReward.required_points - available) : 0;
  const rewardProgress = nextReward ? Math.min(100, Math.round((available / nextReward.required_points) * 100)) : 0;

  const isImg = selectedChild.avatar_url?.startsWith('/images/avatars/');

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        {/* ── En-tête accent ──────────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 12px) 22px 26px',
          background: 'var(--rk-accent)',
          backgroundImage:
            'radial-gradient(circle at 85% 125%, rgba(255,255,255,.2) 0 40%, transparent 41%),' +
            'radial-gradient(circle at 85% 125%, rgba(255,255,255,.14) 60%, transparent 61%)',
          color: 'var(--rk-accentink)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => history.push('/child/profile')} style={{ flexShrink: 0 }}>
              {isImg ? (
                <img src={selectedChild.avatar_url!} alt="" style={{
                  width: 62, height: 62, borderRadius: '50%', objectFit: 'cover',
                  border: '3px solid rgba(255,255,255,.5)', display: 'block', background: '#EDE7FF',
                }} />
              ) : (
                <div style={{
                  width: 62, height: 62, borderRadius: '50%', border: '3px solid rgba(255,255,255,.5)',
                  background: 'rgba(255,255,255,.3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 25, fontWeight: 800,
                }}>{selectedChild.display_name[0]?.toUpperCase()}</div>
              )}
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, opacity: .75 }}>Salut {selectedChild.display_name} !</div>
              <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.03em', marginTop: 2 }}>{levelName}</div>
            </div>

            <button onClick={() => history.push('/child/notifications')} aria-label="Notifications" style={{
              width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative',
            }}>
              <div style={{ width: 14, height: 14, borderRadius: '5px 5px 2px 2px', border: '2px solid currentColor' }} />
              {unread > 0 && (
                <div style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: '50%', background: '#D8556B' }} />
              )}
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, opacity: .85, marginBottom: 7 }}>
              <span>Niveau {level}</span>
              <span>{selectedChild.total_points} / {nextThreshold} pts</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'rgba(255,255,255,.3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'currentColor', opacity: .85 }} />
            </div>
            {nextLevelName && toNextLevel > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, opacity: .75, marginTop: 7 }}>
                Encore {toNextLevel} points pour devenir {nextLevelName}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Série ─────────────────────────────────────────── */}
          {streak > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, background: 'var(--rk-surface)',
              border: '1px solid var(--rk-border)', borderRadius: 20, padding: 16,
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 16, background: 'var(--rk-accentsoft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                fontSize: 20, fontWeight: 800, color: 'var(--rk-text)',
              }}>{streak}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.02em' }}>
                  {streak} jour{streak > 1 ? 's' : ''} d'affilée
                </div>
                <div style={{ fontSize: 13, color: 'var(--rk-text2)', marginTop: 3 }}>
                  Tu es en feu. Ne casse pas la série !
                </div>
              </div>
            </div>
          )}

          {/* ── Trois compteurs ───────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--rk-accent)', letterSpacing: '-.03em' }}>
                {stats?.totalEarned ?? selectedChild.total_points}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rk-text3)', marginTop: 3 }}>TOTAL GAGNÉ</div>
            </div>
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>
                {available}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rk-text3)', marginTop: 3 }}>DISPONIBLES</div>
            </div>
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 18, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--rk-sage)', letterSpacing: '-.03em' }}>
                {stats?.activitiesValidated ?? 0}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--rk-text3)', marginTop: 3 }}>RÉUSSIES</div>
            </div>
          </div>

          {/* ── Défis du jour ─────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>TES DÉFIS DU JOUR</div>
              <button onClick={() => history.push('/child/activities')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-accent)' }}>
                Tout voir
              </button>
            </div>

            {today.length === 0 ? (
              <button onClick={() => history.push('/child/activities')} style={{
                width: '100%', background: 'var(--rk-surface)', border: '1px dashed var(--rk-border)',
                borderRadius: 18, padding: '22px 16px', textAlign: 'center', fontSize: 14, color: 'var(--rk-text3)',
              }}>
                Va choisir un défi pour aujourd'hui
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {today.map(ca => {
                  const style = getCategoryStyle(ca.activity?.category?.slug);
                  const waiting = ca.status === 'submitted';
                  return (
                    <div key={ca.id} style={{
                      display: 'flex', alignItems: 'center', gap: 13, background: 'var(--rk-surface)',
                      border: '1px solid var(--rk-border)', borderRadius: 18, padding: 13,
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 14, background: 'var(--rk-sagesoft)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <img src={style.imgSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>
                          {ca.activity?.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                          {ca.activity?.duration_minutes ? `${ca.activity.duration_minutes} min · ` : ''}
                          {ca.activity?.points ?? 0} points
                        </div>
                      </div>
                      {waiting ? (
                        <div style={{
                          height: 36, padding: '0 13px', borderRadius: 999, background: 'var(--rk-ambersoft)',
                          color: 'var(--rk-amber)', fontSize: 12, fontWeight: 700, flexShrink: 0,
                          display: 'flex', alignItems: 'center',
                        }}>En attente</div>
                      ) : (
                        <button onClick={() => history.push('/child/activities')} style={{
                          height: 36, padding: '0 15px', borderRadius: 999, background: 'var(--rk-accent)',
                          color: 'var(--rk-accentink)', fontSize: 13, fontWeight: 800, flexShrink: 0,
                          display: 'flex', alignItems: 'center',
                        }}>C'est fait</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Ta semaine ────────────────────────────────────── */}
          {week.length > 0 && (
            <div style={{ background: 'var(--rk-surface)', border: '1px solid var(--rk-border)', borderRadius: 20, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>TA SEMAINE</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--rk-accent)' }}>+{weekPoints} pts</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 76 }}>
                {week.map((d, i) => {
                  const h = d.points === 0 ? 6 : Math.max(14, Math.round((d.points / maxPoints) * 66));
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <div style={{
                        width: '100%', height: h, borderRadius: 7,
                        background: d.points === 0 ? 'var(--rk-surface2)' : 'var(--rk-accent)',
                        opacity: d.points === 0 ? 1 : (d.isToday ? 1 : .4 + (d.points / maxPoints) * .3),
                      }} />
                      <span style={{ fontSize: 10, fontWeight: d.isToday ? 800 : 700, color: d.isToday ? 'var(--rk-accent)' : 'var(--rk-text3)' }}>
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Presque ───────────────────────────────────────── */}
          {nextReward && (
            <button onClick={() => history.push('/child/rewards')} style={{
              display: 'block', width: '100%', borderRadius: 22, padding: 18,
              background: 'var(--rk-surface2)', border: '1px solid var(--rk-border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)' }}>PRESQUE</div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)', marginTop: 6 }}>
                Il te manque {missing} points pour {nextReward.title.toLowerCase()}
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--rk-surface)', overflow: 'hidden', marginTop: 13 }}>
                <div style={{ height: '100%', width: `${rewardProgress}%`, borderRadius: 999, background: 'var(--rk-accent)' }} />
              </div>
            </button>
          )}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildHomePage;
