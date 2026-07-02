import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { gamificationService, getRealStreak } from '../../features/gamification/gamification.service';
import { activitiesService } from '../../features/activities/activities.service';
import { LEVEL_NAMES, getStreakMessage } from '../../lib/constants';
import { Flame, ArrowRight, User, Trophy, Star, Zap } from 'lucide-react';
import { HeroHeader, WeeklyTracker, EncouragementCard, ActivityListItem } from '../../components/ui/ChildUIKit';
import type { Activity, ChildActivity } from '../../types/database.types';

const ChildHomePage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const history = useHistory();
  const [weeklyDays, setWeeklyDays] = useState<{ day: string; date: string; count: number; points: number; isToday: boolean }[]>([]);
  const [recentActivities, setRecentActivities] = useState<ChildActivity[]>([]);
  const [dailyChallenges, setDailyChallenges] = useState<Activity[]>([]);
  const [allTimeStats, setAllTimeStats] = useState<{ totalEarned: number; totalSpent: number; activitiesValidated: number } | null>(null);

  useEffect(() => {
    if (selectedChild) {
      gamificationService.getWeeklyDayByDay(selectedChild.id).then(setWeeklyDays).catch(() => {});
      activitiesService.getChildActivities(selectedChild.id).then(a => {
        const completed = a.filter(ca => ca.status === 'validated' || ca.status === 'rejected');
        setRecentActivities(completed.slice(0, 5));
      }).catch(() => {});
      activitiesService.getDailyChallenges(selectedChild.id).then(setDailyChallenges).catch(() => {});
      gamificationService.getAllTimeStats(selectedChild.id).then(setAllTimeStats).catch(() => {});
    }
  }, [selectedChild?.id]);

  if (!selectedChild) return (
    <IonPage><IonContent>
      <div className="dc-empty-state" style={{ height: '100vh' }}>
        <h3>Aucun profil sélectionné</h3>
      </div>
    </IonContent></IonPage>
  );

  const level    = gamificationService.calculateLevel(selectedChild.total_points);
  const progress = gamificationService.getLevelProgress(selectedChild.total_points);
  const levelInfo = LEVEL_NAMES[level - 1] || LEVEL_NAMES[0];
  const initials  = selectedChild.display_name?.[0]?.toUpperCase() || '?';
  const streak    = getRealStreak(selectedChild.streak_days || 0, selectedChild.last_activity_date);

  const statusLabel = (ca: ChildActivity) => {
    if (ca.status === 'validated') return `+${ca.earned_points} pts gagnés !`;
    if (ca.status === 'rejected') return 'Non validée';
    if (ca.status === 'submitted') return 'En attente de validation';
    return 'En cours';
  };

  return (
    <IonPage><IonContent fullscreen scrollY>
      {/* ── Hero ── */}
      <HeroHeader
        name={selectedChild.display_name}
        initials={initials}
        avatarUrl={selectedChild.avatar_url}
        levelName={levelInfo.name}
        levelColor={levelInfo.color}
        totalPoints={selectedChild.total_points}
        xpProgress={progress}
      />

      <div style={{ padding: '20px 20px 100px' }}>
        {/* ── Profile shortcut ── */}
        <button
          onClick={() => history.push('/child/profile')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'white', border: '1.5px solid var(--dc-border)',
            borderRadius: 14, padding: '12px 16px', width: '100%',
            cursor: 'pointer', marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(108,92,231,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User size={18} color="var(--dc-primary)" strokeWidth={2} />
          </div>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--dc-text)', textAlign: 'left' }}>
            Mon profil & avatar
          </span>
          <ArrowRight size={16} color="var(--dc-text-muted)" strokeWidth={2} />
        </button>
        {/* ── Streak ── */}
        <div style={{
          background: streak > 0
            ? 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)'
            : 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)',
          borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: streak > 0 ? '0 4px 16px rgba(255,107,53,0.25)' : 'none',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Flame size={26} color="white" strokeWidth={2} fill={streak > 0 ? 'rgba(255,255,255,0.3)' : 'none'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              {streak} jour{streak !== 1 ? 's' : ''}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, marginTop: 3 }}>
              {getStreakMessage(streak)}
            </div>
          </div>
          {streak >= 3 && (
            <div style={{
              background: 'rgba(255,255,255,0.2)', borderRadius: 8,
              padding: '4px 10px', fontSize: 11, fontWeight: 800,
              color: 'white', letterSpacing: 0.5,
            }}>
              x{Math.min(streak, 7)} BONUS
            </div>
          )}
        </div>

        {/* ── Points overview ── */}
        {allTimeStats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
            <div style={{
              background: 'white', borderRadius: 14, padding: '14px 10px',
              textAlign: 'center', border: '1.5px solid var(--dc-border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <Star size={18} color="var(--dc-gold-dark)" strokeWidth={2} style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dc-gold-dark)' }}>
                {allTimeStats.totalEarned}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                TOTAL GAGNÉ
              </div>
            </div>
            <div style={{
              background: 'white', borderRadius: 14, padding: '14px 10px',
              textAlign: 'center', border: '1.5px solid var(--dc-border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <Zap size={18} color="var(--dc-primary)" strokeWidth={2} style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dc-primary)' }}>
                {selectedChild.total_points}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                DISPONIBLES
              </div>
            </div>
            <div style={{
              background: 'white', borderRadius: 14, padding: '14px 10px',
              textAlign: 'center', border: '1.5px solid var(--dc-border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <Trophy size={18} color="var(--dc-green)" strokeWidth={2} style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dc-green)' }}>
                {allTimeStats.activitiesValidated}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dc-text-muted)', marginTop: 2 }}>
                RÉUSSIES
              </div>
            </div>
          </div>
        )}

        {/* ── Encouragement ── */}
        <div style={{ marginBottom: 20 }}>
          <EncouragementCard />
        </div>

        {/* ── Défis du jour ── */}
        {dailyChallenges.length > 0 && (
          <>
            <h2 className="dc-section-title">Défis du jour</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {dailyChallenges.map((act, i) => (
                <button
                  key={act.id}
                  onClick={() => history.push('/child/activities')}
                  style={{
                    background: 'white', borderRadius: 14, padding: '14px 16px',
                    border: '1.5px solid var(--dc-border)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    textAlign: 'left', transition: 'transform 0.15s',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: '#FEF3C7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src="/images/menu/star.png" alt="défi" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dc-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {act.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginTop: 2 }}>
                      +{act.points} pts
                    </div>
                  </div>
                  <ArrowRight size={16} color="var(--dc-text-muted)" strokeWidth={2} />
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Stats semaine ── */}
        {/* ── Suivi semaine ── */}
        {weeklyDays.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <WeeklyTracker days={weeklyDays} />
          </div>
        )}

        {/* ── CTA ── */}
        <button
          className="dc-btn dc-btn-green dc-btn-full dc-btn-lg"
          style={{ marginBottom: 24 }}
          onClick={() => history.push('/child/activities')}
        >
          Voir toutes les activités
        </button>

        {/* ── Activités récentes ── */}
        {recentActivities.length > 0 && (<>
          <h2 className="dc-section-title">Dernières activités terminées</h2>
          {recentActivities.map(ca => (
            <ActivityListItem
              key={ca.id}
              title={ca.activity?.title || ''}
              points={ca.activity?.points || 0}
              categorySlug={ca.activity?.category?.slug}
              status={ca.status as any}
              statusLabel={statusLabel(ca)}
            />
          ))}
        </>)}
      </div>
    </IonContent></IonPage>
  );
};

export default ChildHomePage;
