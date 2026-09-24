import { useSwipe, stepSection } from '../../hooks/useSwipe';
import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { gamificationService } from '../../features/gamification/gamification.service';
import { LEVEL_NAMES, POINTS_CONFIG } from '../../lib/constants';
import type { Badge, ChildBadge, PointsLedgerEntry } from '../../types/database.types';

/** Points & niveaux — porté de la maquette Rekonect (écran cPoints). */

const THEME_UNLOCK: Record<number, string> = {
  3: 'thème Océan débloqué',
  5: 'thème Menthe débloqué',
  7: 'thème Myrtille débloqué',
  9: 'thème Soleil débloqué',
  10: 'thème Framboise débloqué',
};

const ChildPointsPage: React.FC = () => {
  const { selectedChild, refreshSelectedChild } = useAppStore();
  const back = useRkBack('/child/home');
  const [tab, setTab] = useState<'levels' | 'badges' | 'history'>('levels');
  const SECTIONS = ['levels', 'badges', 'history'] as const;
  const swipe = useSwipe({
    onLeft:  () => stepSection(SECTIONS, tab, 1, setTab),
    onRight: () => stepSection(SECTIONS, tab, -1, setTab),
  });
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<ChildBadge[]>([]);
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);

  const load = () => {
    if (!selectedChild) return;
    gamificationService.getAllBadges().then(setAllBadges).catch(() => {});
    gamificationService.getChildBadges(selectedChild.id).then(setEarned).catch(() => {});
    gamificationService.getPointsHistory(selectedChild.id, 30).then(setLedger).catch(() => {});
  };

  useEffect(load, [selectedChild?.id]);
  useIonViewWillEnter(() => { refreshSelectedChild(); load(); });

  if (!selectedChild) return null;

  const points = selectedChild.total_points;
  const level = gamificationService.calculateLevel(points);
  const levelName = LEVEL_NAMES[level - 1]?.name ?? 'Graine';
  const nextName = LEVEL_NAMES[level]?.name;
  const nextThreshold = gamificationService.getNextLevelThreshold(points);
  const progress = gamificationService.getLevelProgress(points);
  const toNext = Math.max(0, nextThreshold - points);

  const earnedIds = new Set(earned.map(b => b.badge_id));
  const thresholds = POINTS_CONFIG.levelThresholds;

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }} {...swipe}>

        {/* ── En-tête accent ──────────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 12px) 22px 24px',
          background: 'var(--rk-accent)',
          backgroundImage:
            'radial-gradient(circle at 50% 130%, rgba(255,255,255,.22) 0 38%, transparent 39%),' +
            'radial-gradient(circle at 50% 130%, rgba(255,255,255,.14) 56%, transparent 57%)',
          color: 'var(--rk-accentink)', textAlign: 'center',
        }}>
          <button onClick={back} style={{
            fontSize: 13, fontWeight: 700, opacity: .8, marginBottom: 10, display: 'block',
          }}>← Accueil</button>

          <div style={{
            width: 74, height: 74, borderRadius: '50%', background: 'rgba(255,255,255,.3)',
            margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800,
          }}>{level}</div>

          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.03em' }}>{levelName}</div>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: .8, marginTop: 3 }}>{points} points au total</div>

          <div style={{ maxWidth: 250, margin: '18px auto 0' }}>
            <div style={{ height: 9, borderRadius: 999, background: 'rgba(255,255,255,.3)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'currentColor', opacity: .85 }} />
            </div>
            {nextName && (
              <div style={{ fontSize: 12, fontWeight: 600, opacity: .8, marginTop: 8 }}>
                {toNext} points avant {nextName}
              </div>
            )}
          </div>
        </div>

        {/* ── Bascule ─────────────────────────────────────────── */}
        <div style={{ padding: '12px 22px 0' }}>
          <div style={{ display: 'flex', gap: 5, background: 'var(--rk-surface2)', padding: 4, borderRadius: 13 }}>
            {([['levels', 'Niveaux'], ['badges', 'Badges'], ['history', 'Historique']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: 'center',
                background: tab === k ? 'var(--rk-surface)' : 'transparent',
                color: tab === k ? 'var(--rk-text)' : 'var(--rk-text3)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── Niveaux ─────────────────────────────────────────── */}
        {tab === 'levels' && (
          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {LEVEL_NAMES.map((lvl, i) => {
              const n = i + 1;
              const threshold = thresholds[i] ?? 0;
              const unlocked = n < level;
              const current = n === level;
              const missing = threshold - points;
              return (
                <div key={lvl.name} style={{
                  display: 'flex', alignItems: 'center', gap: 13, borderRadius: 16, padding: '12px 14px',
                  background: current ? 'var(--rk-accentsoft)' : 'var(--rk-surface)',
                  border: current ? '1.5px solid var(--rk-accent)' : '1px solid var(--rk-border)',
                  opacity: unlocked ? .6 : (current ? 1 : (n > level + 2 ? .55 : 1)),
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800,
                    background: current ? 'var(--rk-accent)' : (unlocked ? 'var(--rk-sagesoft)' : 'var(--rk-surface2)'),
                    color: current ? 'var(--rk-accentink)' : (unlocked ? 'var(--rk-sage)' : 'var(--rk-text3)'),
                  }}>{n}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: current ? 800 : 700, color: 'var(--rk-text)' }}>{lvl.name}</div>
                    <div style={{ fontSize: 11, color: current ? 'var(--rk-text2)' : 'var(--rk-text3)', marginTop: 1 }}>
                      {threshold} point{threshold > 1 ? 's' : ''}
                      {THEME_UNLOCK[n] ? ` · ${THEME_UNLOCK[n]}` : ''}
                    </div>
                  </div>

                  {current ? (
                    <div style={{
                      height: 24, padding: '0 9px', borderRadius: 999, background: 'var(--rk-accent)',
                      color: 'var(--rk-accentink)', fontSize: 10, fontWeight: 800,
                      display: 'flex', alignItems: 'center', flexShrink: 0,
                    }}>ACTUEL</div>
                  ) : unlocked ? (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rk-sage)', flexShrink: 0 }}>Débloqué</div>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--rk-text3)', flexShrink: 0 }}>{missing} pts</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Badges ──────────────────────────────────────────── */}
        {tab === 'badges' && (
          <div style={{ padding: '18px 22px 140px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {allBadges.map(b => {
              const got = earnedIds.has(b.id);
              return (
                <div key={b.id} style={{
                  background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                  borderRadius: 18, padding: '16px 10px', textAlign: 'center', opacity: got ? 1 : .45,
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%', margin: '0 auto 10px',
                    background: got ? 'var(--rk-ambersoft)' : 'var(--rk-surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>{b.icon || '🏅'}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--rk-text)', lineHeight: 1.3 }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--rk-text3)', marginTop: 3 }}>
                    {got ? 'Débloqué' : `${b.condition_value} pts`}
                  </div>
                </div>
              );
            })}
            {allBadges.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: 'var(--rk-text3)', fontSize: 14 }}>
                Les badges arrivent bientôt.
              </div>
            )}
          </div>
        )}

        {/* ── Historique ──────────────────────────────────────── */}
        {tab === 'history' && (
          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ledger.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--rk-text3)', fontSize: 14 }}>
                Rien encore. Termine un défi pour gagner tes premiers points !
              </div>
            ) : ledger.map(entry => {
              const positive = entry.points >= 0;
              return (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, background: 'var(--rk-surface)',
                  border: '1px solid var(--rk-border)', borderRadius: 16, padding: '12px 14px',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                    background: positive ? 'var(--rk-sagesoft)' : 'var(--rk-raspsoft)',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text)' }}>{entry.reason || 'Points'}</div>
                    <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                    color: positive ? 'var(--rk-sage)' : 'var(--rk-rasp)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {positive ? '+' : ''}{entry.points}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </IonContent></IonPage>
  );
};

export default ChildPointsPage;
