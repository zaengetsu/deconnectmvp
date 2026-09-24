import RkTile from '../../components/rk/RkTile';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { rewardsService } from '../../features/rewards/rewards.service';
import { gamificationService } from '../../features/gamification/gamification.service';
import RkSearch from '../../components/rk/RkSearch';
import { matches } from '../../lib/search';
import type { Reward, RewardRequest } from '../../types/database.types';

/** Récompenses enfant — porté de la maquette Rekonect (écran cRewards). */

const ChildRewardsPage: React.FC = () => {
  const { selectedChild, refreshSelectedChild } = useAppStore();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [query, setQuery] = useState('');

  const loadData = () => {
    if (!selectedChild) return;
    rewardsService.getChildRewards(selectedChild.parent_id, selectedChild.id).then(setRewards).catch(() => {});
    rewardsService.getChildRewardRequests(selectedChild.id).then(setRequests).catch(() => {});
    gamificationService.getAllTimeStats(selectedChild.id)
      .then(s => setAvailable(s.totalEarned - s.totalSpent))
      .catch(() => setAvailable(selectedChild.total_points));
  };

  useEffect(loadData, [selectedChild?.id]);
  useIonViewWillEnter(() => { refreshSelectedChild(); loadData(); });

  if (!selectedChild) return null;

  const pendingIds = new Set(requests.filter(r => r.status === 'pending').map(r => r.reward_id));
  const pendingReward = rewards.find(r => pendingIds.has(r.id));

  const searched = rewards.filter(r => matches(query, r.title, r.description));
  const affordable = searched.filter(r => r.required_points <= available);
  const locked = searched
    .filter(r => r.required_points > available)
    .sort((a, b) => a.required_points - b.required_points);

  const handleRequest = async (reward: Reward) => {
    setRequesting(reward.id);
    try {
      await rewardsService.requestReward(selectedChild.id, reward.id);
      await refreshSelectedChild();
      loadData();
    } catch (e) {
      console.error('[ChildRewards]', e);
    } finally {
      setRequesting(null);
    }
  };

  const card: React.CSSProperties = {
    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
    borderRadius: 20, padding: 16,
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', marginBottom: 12,
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Récompenses
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
            <div style={{
              height: 30, padding: '0 13px', borderRadius: 999, background: 'var(--rk-accentsoft)',
              color: 'var(--rk-text)', fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums',
            }}>
              {available} points à dépenser
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {rewards.length > 4 && (
            <RkSearch value={query} onChange={setQuery} placeholder="Chercher une récompense" />
          )}

          {query && affordable.length === 0 && locked.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--rk-text3)', fontSize: 13 }}>
              Rien ne correspond à « {query} ».
            </div>
          )}

          {pendingReward && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--rk-ambersoft)', borderRadius: 20, padding: 16,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--rk-amber)', flexShrink: 0, opacity: .85 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Demande envoyée</div>
                <div style={{ fontSize: 12, color: 'var(--rk-text2)', marginTop: 2 }}>
                  Ton parent va répondre pour « {pendingReward.title} »
                </div>
              </div>
            </div>
          )}

          {affordable.length > 0 && (
            <div>
              <div style={eyebrow}>TU PEUX LES DEMANDER</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {affordable.map(r => {
                  const asked = pendingIds.has(r.id);
                  return (
                    <div key={r.id} style={card}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
                        <RkTile img="/images/menu/gift.png" tint="var(--rk-indigosoft)" size={48} radius={15} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                            {r.description || 'Privilège'} · {r.required_points} points
                          </div>
                        </div>
                      </div>
                      {asked ? (
                        <div style={{
                          width: '100%', height: 44, borderRadius: 999, background: 'var(--rk-ambersoft)',
                          color: 'var(--rk-amber)', fontSize: 13, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>Demande envoyée</div>
                      ) : (
                        <button
                          onClick={() => handleRequest(r)}
                          disabled={requesting === r.id}
                          style={{
                            width: '100%', height: 44, borderRadius: 999, background: 'var(--rk-accent)',
                            color: 'var(--rk-accentink)', fontSize: 14, fontWeight: 800,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: requesting === r.id ? .6 : 1,
                          }}
                        >
                          {requesting === r.id ? 'Envoi…' : 'Demander'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {locked.length > 0 && (
            <div>
              <div style={eyebrow}>BIENTÔT À TOI</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {locked.map((r, i) => {
                  const missing = r.required_points - available;
                  const pct = Math.min(100, Math.round((available / r.required_points) * 100));
                  return (
                    <div key={r.id} style={{ ...card, opacity: i === 0 ? 1 : .7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 15, background: 'var(--rk-surface2)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>{r.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                            {r.required_points} points · il te manque {missing}
                          </div>
                        </div>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--rk-surface2)', overflow: 'hidden', marginTop: 14 }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'var(--rk-accent)', opacity: i === 0 ? 1 : .6 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {rewards.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 12px' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', marginBottom: 6 }}>Pas encore de récompense</div>
              <div style={{ fontSize: 14, color: 'var(--rk-text3)', lineHeight: 1.5 }}>
                Demande à tes parents d'en préparer une.
              </div>
            </div>
          )}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildRewardsPage;
