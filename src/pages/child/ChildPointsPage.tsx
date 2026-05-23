import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { gamificationService } from '../../features/gamification/gamification.service';
import { LEVEL_NAMES, POINTS_CONFIG } from '../../lib/constants';
import { Trophy, Shield, ShieldCheck, Lock, Star, BarChart2, ScrollText, CheckCircle } from 'lucide-react';
import type { Badge, ChildBadge, PointsLedgerEntry } from '../../types/database.types';

/* Lucide icon per level number (1-indexed) */
const LEVEL_ICONS = [
  Star, Star, Shield, Shield, Trophy,
  Trophy, Trophy, ShieldCheck, ShieldCheck, Trophy,
];

const ChildPointsPage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const [badges, setBadges]       = useState<ChildBadge[]>([]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [history, setHistory]     = useState<PointsLedgerEntry[]>([]);
  const [tab, setTab]             = useState<'level' | 'badges' | 'history'>('level');

  useEffect(() => {
    if (selectedChild) {
      gamificationService.getChildBadges(selectedChild.id).then(setBadges);
      gamificationService.getAllBadges().then(setAllBadges);
      gamificationService.getPointsHistory(selectedChild.id, 30).then(setHistory);
    }
  }, [selectedChild]);

  if (!selectedChild) return null;

  const level         = gamificationService.calculateLevel(selectedChild.total_points);
  const progress      = gamificationService.getLevelProgress(selectedChild.total_points);
  const nextThreshold = gamificationService.getNextLevelThreshold(selectedChild.total_points);
  const levelInfo     = LEVEL_NAMES[level - 1] || LEVEL_NAMES[0];
  const nextLevelInfo = LEVEL_NAMES[level] || null;
  const earnedBadgeIds = new Set(badges.map(b => b.badge_id));
  const LevelIcon     = LEVEL_ICONS[Math.min(level - 1, LEVEL_ICONS.length - 1)];

  const TAB_ITEMS = [
    { key: 'level',   label: 'Niveaux',           Icon: BarChart2 },
    { key: 'badges',  label: `Badges (${badges.length})`, Icon: Trophy },
    { key: 'history', label: 'Historique',         Icon: ScrollText },
  ] as const;

  return (
    <IonPage>
      <IonContent fullscreen scrollY>
        <div style={{ paddingBottom: 100 }}>
          {/* ── Level Header ── */}
          <div style={{
            background: `linear-gradient(135deg, ${levelInfo.color} 0%, ${levelInfo.color}cc 100%)`,
            padding: '52px 24px 28px', color: 'white', textAlign: 'center',
            borderRadius: '0 0 28px 28px',
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', marginBottom: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              <LevelIcon size={38} color="white" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 2px' }}>{levelInfo.name}</h1>
            <p style={{ opacity: 0.85, fontSize: 14, margin: '0 0 18px', fontWeight: 600 }}>
              Niveau {level} · {selectedChild.total_points} pts
            </p>
            {/* XP bar */}
            <div style={{ maxWidth: 300, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.9 }}>
                <span>Niv. {level}</span>
                {nextLevelInfo && <span>Niv. {level + 1} — {nextLevelInfo.name}</span>}
              </div>
              <div className="dc-xp-bar" style={{ height: 10 }}>
                <div className="dc-xp-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, textAlign: 'right' }}>
                {nextLevelInfo ? `${nextThreshold - selectedChild.total_points} pts restants` : 'Niveau maximum atteint !'}
              </div>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', padding: '12px 16px 0', gap: 4 }}>
            {TAB_ITEMS.map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 700,
                background: 'none', border: 'none', cursor: 'pointer',
                color: tab === key ? 'var(--dc-blue)' : 'var(--dc-text-light)',
                borderBottom: `3px solid ${tab === key ? 'var(--dc-blue)' : 'transparent'}`,
                transition: 'all 0.2s', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 4,
              }}>
                <Icon size={16} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>

          <div style={{ padding: '16px 20px' }}>

            {/* ── LEVELS TAB ── */}
            {tab === 'level' && (
              <div>
                {LEVEL_NAMES.map((lv, i) => {
                  const lvNum     = i + 1;
                  const threshold = POINTS_CONFIG.levelThresholds[i];
                  const isCurrentLevel = lvNum === level;
                  const isUnlocked     = lvNum <= level;
                  const LvIcon = LEVEL_ICONS[Math.min(i, LEVEL_ICONS.length - 1)];

                  return (
                    <div key={i} className="dc-animate-in" style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 16px', marginBottom: 8, borderRadius: 16,
                      background: isCurrentLevel ? `${lv.color}15` : isUnlocked ? 'white' : 'rgba(0,0,0,0.02)',
                      border: `2px solid ${isCurrentLevel ? lv.color : 'transparent'}`,
                      opacity: isUnlocked ? 1 : 0.45,
                      boxShadow: isCurrentLevel ? `0 2px 12px ${lv.color}30` : 'var(--dc-shadow)',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUnlocked ? `${lv.color}25` : 'var(--dc-bg)', flexShrink: 0 }}>
                        {isUnlocked
                          ? <LvIcon size={22} color={lv.color} strokeWidth={1.8} />
                          : <Lock size={18} color="var(--dc-text-muted)" strokeWidth={2} />
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: isUnlocked ? 'var(--dc-text)' : 'var(--dc-text-muted)' }}>
                          {lv.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--dc-text-light)' }}>
                          Niveau {lvNum} · {threshold} pts requis
                        </div>
                      </div>
                      {isCurrentLevel && (
                        <div style={{ padding: '4px 10px', borderRadius: 50, background: lv.color, color: 'white', fontSize: 10, fontWeight: 800 }}>
                          ACTUEL
                        </div>
                      )}
                      {isUnlocked && !isCurrentLevel && (
                        <CheckCircle size={18} color="var(--dc-green)" strokeWidth={2} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── BADGES TAB ── */}
            {tab === 'badges' && (
              <div>
                {badges.length > 0 && (<>
                  <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trophy size={16} color="var(--dc-gold)" strokeWidth={2} /> Gagnés
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                    {badges.map(cb => (
                      <div key={cb.id} style={{ textAlign: 'center', padding: 14, borderRadius: 16, background: 'white', boxShadow: 'var(--dc-shadow)', border: '2px solid var(--dc-blue-light)' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--dc-gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                          <Trophy size={20} color="var(--dc-gold-dark)" strokeWidth={1.8} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>{cb.badge?.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--dc-text-muted)', marginTop: 2 }}>{cb.badge?.description}</div>
                      </div>
                    ))}
                  </div>
                </>)}

                {(() => {
                  const locked = allBadges.filter(b => !earnedBadgeIds.has(b.id));
                  if (locked.length === 0) return null;
                  return (<>
                    <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lock size={15} color="var(--dc-text-muted)" strokeWidth={2} /> À débloquer
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {locked.map(b => (
                        <div key={b.id} style={{ textAlign: 'center', padding: 14, borderRadius: 16, background: 'rgba(0,0,0,0.03)', opacity: 0.55 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--dc-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                            <Lock size={18} color="var(--dc-text-muted)" strokeWidth={1.8} />
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 800 }}>{b.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--dc-text-muted)', marginTop: 2 }}>{b.description}</div>
                        </div>
                      ))}
                    </div>
                  </>);
                })()}

                {allBadges.length === 0 && badges.length === 0 && (
                  <div className="dc-empty-state">
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Trophy size={28} color="var(--dc-gold-dark)" strokeWidth={1.5} />
                    </div>
                    <h3>Les badges arrivent bientôt !</h3>
                  </div>
                )}
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {tab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <div className="dc-empty-state">
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <ScrollText size={28} color="var(--dc-blue)" strokeWidth={1.5} />
                    </div>
                    <h3>Pas encore de points</h3>
                    <p>Complète des activités pour gagner tes premiers points !</p>
                  </div>
                ) : history.map(entry => (
                  <div key={entry.id} className="dc-animate-in" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 6, borderRadius: 14, background: 'white', boxShadow: 'var(--dc-shadow)' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: entry.points > 0 ? 'var(--dc-green-light)' : 'var(--dc-danger-light)' }}>
                      <Star size={18} color={entry.points > 0 ? 'var(--dc-green)' : 'var(--dc-danger)'} strokeWidth={2} fill={entry.points > 0 ? 'var(--dc-green-light)' : 'transparent'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.reason}</div>
                      <div style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
                        {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: entry.points > 0 ? 'var(--dc-green)' : 'var(--dc-danger)' }}>
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildPointsPage;
