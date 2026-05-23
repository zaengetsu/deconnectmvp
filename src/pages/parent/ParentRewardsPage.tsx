import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { rewardsService } from '../../features/rewards/rewards.service';
import { notificationService } from '../../features/notifications/notification.service';
import { REWARD_CATEGORIES } from '../../lib/constants';
import { Gift, Plus, CheckCircle, Compass, Crown, Shield, Award, Heart } from 'lucide-react';
import type { Reward, RewardRequest } from '../../types/database.types';

// Map category icon names to Lucide components
const CATEGORY_ICONS: Record<string, React.FC<any>> = {
  compass: Compass, crown: Crown, shield: Shield, award: Award, heart: Heart,
};

type Tab = 'mine' | 'catalog';

const ParentRewardsPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [tab, setTab] = useState<Tab>('mine');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [catalog, setCatalog] = useState<Reward[]>([]);
  const [activating, setActivating] = useState<string | null>(null);
  const [activated, setActivated] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    const [r, req] = await Promise.all([
      rewardsService.getRewards(user.id),
      rewardsService.getPendingRewardRequests(user.id),
    ]);
    setRewards(r); setRequests(req);

    // Build set of already-activated titles
    setActivated(new Set(r.map(rw => rw.title)));
  };

  const loadCatalog = async () => {
    const c = await rewardsService.getCatalogRewards();
    setCatalog(c);
  };

  useEffect(() => { load(); loadCatalog(); }, [user]);

  const handleApprove = async (req: RewardRequest) => {
    if (!user) return;
    await rewardsService.approveRewardRequest(req.id, user.id);
    if (req.child?.id) {
      notificationService.createNotification(
        'child', req.child.id,
        'Récompense accordée',
        `"${req.reward?.title}" t'a été accordée !`,
        'gift', '/child/rewards',
        { type: 'reward_approved', reward_id: req.id }
      ).catch(() => {});
    }
    load();
  };

  const handleReject = async (req: RewardRequest) => {
    if (!user) return;
    await rewardsService.rejectRewardRequest(req.id, user.id);
    if (req.child?.id) {
      notificationService.createNotification(
        'child', req.child.id,
        'Récompense non accordée',
        `"${req.reward?.title}" n'est pas encore disponible. Continue à gagner des points !`,
        'info', '/child/points',
        { type: 'reward_rejected', reward_id: req.id }
      ).catch(() => {});
    }
    load();
  };

  const handleActivate = async (catalogReward: Reward) => {
    if (!user) return;
    setActivating(catalogReward.id);
    try {
      await rewardsService.activateCatalogReward(user.id, catalogReward);
      setActivated(prev => new Set([...prev, catalogReward.title]));
      load();
    } catch (e) { console.error(e); }
    setActivating(null);
  };

  const iconBox: React.CSSProperties = {
    width: 38, height: 38, borderRadius: 10,
    background: 'rgba(108,92,231,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };

  // Group catalog by category
  const catalogByCategory = Object.entries(REWARD_CATEGORIES).map(([key, meta]) => ({
    key,
    ...meta,
    items: catalog.filter(r => r.reward_category === key),
  })).filter(g => g.items.length > 0);

  return (
    <IonPage><IonContent fullscreen>
      <div style={{ padding: '20px 20px 100px' }}>
        <div className="dc-page-header"><h1>Récompenses</h1><p>Gérez et choisissez les récompenses</p></div>

        {/* ── Tab switcher ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {([['mine', 'Mes récompenses'], ['catalog', 'Catalogue']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: `2px solid ${tab === t ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
              background: tab === t ? 'rgba(108,92,231,0.08)' : 'white',
              color: tab === t ? 'var(--dc-primary)' : 'var(--dc-text-light)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: Mes récompenses ═══ */}
        {tab === 'mine' && (<>
          <button className="dc-btn dc-btn-primary dc-btn-full"
            style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={() => history.push('/parent/create-reward')}>
            <Plus size={16} strokeWidth={2.5} />
            Créer une récompense
          </button>

          {/* Pending requests */}
          {requests.length > 0 && (<>
            <h3 className="dc-section-title">Demandes en attente ({requests.length})</h3>
            {requests.map(req => (
              <div key={req.id} className="dc-card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={iconBox}>
                    <Gift size={18} color="var(--dc-primary)" strokeWidth={1.8} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{req.reward?.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>
                      {req.child?.display_name} · {req.reward?.required_points} pts
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="dc-btn dc-btn-primary" style={{ flex: 1, padding: '10px' }}
                    onClick={() => handleApprove(req)}>Approuver</button>
                  <button className="dc-btn dc-btn-outline" style={{ flex: 1, padding: '10px' }}
                    onClick={() => handleReject(req)}>Refuser</button>
                </div>
              </div>
            ))}
          </>)}

          {/* Rewards list */}
          <h3 className="dc-section-title">Récompenses créées ({rewards.length})</h3>
          {rewards.length === 0 ? (
            <div className="dc-card" style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ ...iconBox, margin: '0 auto 12px', width: 48, height: 48, borderRadius: 14 }}>
                <Gift size={22} color="var(--dc-text-muted)" strokeWidth={1.5} />
              </div>
              <p style={{ color: 'var(--dc-text-light)', margin: 0 }}>
                Créez votre première récompense ou parcourez le catalogue
              </p>
            </div>
          ) : rewards.map(r => (
            <div key={r.id} className="dc-card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={iconBox}>
                <Gift size={18} color="var(--dc-primary)" strokeWidth={1.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{r.title}</div>
                {r.description && <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>{r.description}</div>}
              </div>
              <div className="dc-badge-pill" style={{ background: 'rgba(108,92,231,0.1)', color: 'var(--dc-primary)' }}>
                {r.required_points} pts
              </div>
            </div>
          ))}
        </>)}

        {/* ═══ TAB: Catalogue ═══ */}
        {tab === 'catalog' && (<>
          <p style={{ fontSize: 14, color: 'var(--dc-text-light)', marginBottom: 20, lineHeight: 1.6 }}>
            Parcourez les récompenses suggérées par catégorie. Ajoutez celles qui conviennent à votre famille.
          </p>

          {catalogByCategory.map(({ key, label, color, icon, items }) => {
            const IconCmp = CATEGORY_ICONS[icon] || Gift;
            return (
              <div key={key} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconCmp size={18} color={color} strokeWidth={1.8} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--dc-text)' }}>
                    {label}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--dc-text-muted)', fontWeight: 500 }}>
                    {items.length} idées
                  </span>
                </div>

                {items.map(r => {
                  const isAdded = activated.has(r.title);
                  return (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', background: 'white', borderRadius: 12,
                      border: '1px solid var(--dc-border)', marginBottom: 6,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                        {r.description && (
                          <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.description}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>
                        {r.required_points} pts
                      </div>
                      {isAdded ? (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 12, fontWeight: 600, color: 'var(--dc-green)',
                          flexShrink: 0,
                        }}>
                          <CheckCircle size={14} strokeWidth={2} /> Ajouté
                        </div>
                      ) : (
                        <button
                          onClick={() => handleActivate(r)}
                          disabled={activating === r.id}
                          style={{
                            background: `${color}12`, border: `1.5px solid ${color}40`,
                            borderRadius: 8, padding: '6px 12px',
                            fontSize: 12, fontWeight: 700, color,
                            cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                          }}
                        >
                          {activating === r.id ? '...' : '+ Ajouter'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>)}
      </div>
    </IonContent></IonPage>
  );
};

export default ParentRewardsPage;
