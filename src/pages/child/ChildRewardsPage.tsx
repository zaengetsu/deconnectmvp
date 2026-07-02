import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { useAuthStore } from '../../stores/auth.store';
import { rewardsService } from '../../features/rewards/rewards.service';
import { Gift, Clock, Star, Lock } from 'lucide-react';
import { PointsBadge } from '../../components/ui/ChildUIKit';
import type { Reward, RewardRequest } from '../../types/database.types';

const ChildRewardsPage: React.FC = () => {
  const { selectedChild, refreshSelectedChild } = useAppStore();
  const { user } = useAuthStore();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);

  const loadData = () => {
    if (selectedChild && user) {
      rewardsService.getChildRewards(user.id, selectedChild.id).then(setRewards);
      rewardsService.getChildRewardRequests(selectedChild.id).then(setRequests);
    }
  };

  useEffect(loadData, [selectedChild, user]);
  useIonViewWillEnter(() => { refreshSelectedChild(); loadData(); });

  const handleRequest = async (reward: Reward) => {
    if (!selectedChild) return;
    setRequesting(reward.id);
    try {
      await rewardsService.requestReward(selectedChild.id, reward.id);
      await refreshSelectedChild();
      rewardsService.getChildRewardRequests(selectedChild.id).then(setRequests);
    } catch (e) { console.error(e); }
    setRequesting(null);
  };

  if (!selectedChild) return null;

  const requestedIds = new Set(requests.filter(r => r.status === 'pending').map(r => r.reward_id));
  const pendingReqs  = requests.filter(r => r.status === 'pending');

  return (
    <IonPage><IonContent fullscreen scrollY>
      {/* ── Header ── */}
      <div className="dc-page-header">
        <div className="dc-header-row">
          <img src="/images/menu/trophy.png" alt="récompenses" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <h1>Récompenses</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <img src="/images/menu/star.png" alt="pts" style={{ width: 14, height: 14, objectFit: 'contain' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dc-gold-dark)' }}>
            {selectedChild.total_points} points disponibles
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 20px 100px' }}>
        {/* ── Pending requests ── */}
        {pendingReqs.length > 0 && (<>
          <h2 className="dc-section-title">En attente</h2>
          {pendingReqs.map(req => (
            <div key={req.id} className="dc-card dc-animate-in" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--dc-gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Clock size={20} color="var(--dc-gold-dark)" strokeWidth={2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{req.reward?.title}</div>
                <div style={{ fontSize: 12, color: 'var(--dc-text-light)' }}>Demande envoyée à ton parent</div>
              </div>
            </div>
          ))}
        </>)}

        {/* ── Available rewards ── */}
        <h2 className="dc-section-title">Disponibles</h2>

        {rewards.length === 0 ? (
          <div className="dc-empty-state">
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Gift size={32} color="var(--dc-blue)" strokeWidth={1.5} />
            </div>
            <h3>Pas encore de récompenses</h3>
            <p>Ton parent va bientôt en créer !</p>
          </div>
        ) : rewards.map(r => {
          const canAfford = selectedChild.total_points >= r.required_points;
          const alreadyRequested = requestedIds.has(r.id);
          const missing = r.required_points - selectedChild.total_points;

          return (
            <div key={r.id} className="dc-card dc-animate-in" style={{ marginBottom: 12, opacity: canAfford ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: canAfford && !alreadyRequested ? 12 : 0 }}>
                {/* Icon */}
                <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: canAfford ? 'var(--dc-green-light)' : 'var(--dc-bg)' }}>
                  {canAfford
                    ? <Gift size={26} color="var(--dc-green)" strokeWidth={1.8} />
                    : <Lock size={22} color="var(--dc-text-muted)" strokeWidth={1.8} />
                  }
                </div>
                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
                  {r.description && <div style={{ fontSize: 13, color: 'var(--dc-text-light)', marginTop: 2 }}>{r.description}</div>}
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PointsBadge points={r.required_points} size="sm" />
                    {!canAfford && (
                      <span style={{ fontSize: 11, color: 'var(--dc-danger)', fontWeight: 600 }}>
                        encore {missing} pts
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* CTA */}
              {canAfford && !alreadyRequested && (
                <button className="dc-btn dc-btn-green dc-btn-full" style={{ height: 44, fontSize: 14 }}
                  disabled={requesting === r.id} onClick={() => handleRequest(r)}>
                  {requesting === r.id ? 'Demande...' : 'Demander cette récompense'}
                </button>
              )}
              {alreadyRequested && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', color: 'var(--dc-gold-dark)', fontSize: 13, fontWeight: 600 }}>
                  <Clock size={14} strokeWidth={2} />
                  Demande envoyée
                </div>
              )}
            </div>
          );
        })}
      </div>
    </IonContent></IonPage>
  );
};

export default ChildRewardsPage;
