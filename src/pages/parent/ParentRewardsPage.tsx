import React, { useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { rewardsService } from '../../features/rewards/rewards.service';
import { REWARD_CATEGORIES } from '../../lib/constants';
import RkSearch from '../../components/rk/RkSearch';
import RkTile from '../../components/rk/RkTile';
import { useSwipe, stepSection } from '../../hooks/useSwipe';
import { matches } from '../../lib/search';
import type { Reward, RewardRequest } from '../../types/database.types';

/** Récompenses parent — porté de la maquette Rekonect (écran pRewards). */

const CATEGORY_TINT: Record<string, string> = {
  experience: 'var(--rk-sagesoft)',
  privilege: 'var(--rk-indigosoft)',
  responsibility: 'var(--rk-indigosoft)',
  symbolic: 'var(--rk-ambersoft)',
  family: 'var(--rk-raspsoft)',
};

const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
};

const ParentRewardsPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'mine' | 'catalog'>('mine');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [requests, setRequests] = useState<RewardRequest[]>([]);
  const [catalog, setCatalog] = useState<Reward[]>([]);
  const [activating, setActivating] = useState<string | null>(null);
  const [activated, setActivated] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const fetchAll = () => {
    if (!user) return;
    Promise.all([
      rewardsService.getRewards(user.id),
      rewardsService.getPendingRewardRequests(user.id),
    ]).then(([r, req]) => {
      setRewards(r);
      setRequests(req);
      setActivated(new Set(r.map(rw => rw.title)));
    }).catch(() => {});
    rewardsService.getCatalogRewards().then(setCatalog).catch(() => {});
  };

  useIonViewWillEnter(fetchAll);

  const approve = async (req: RewardRequest) => {
    if (!user) return;
    setProcessing(req.id);
    try { await rewardsService.approveRewardRequest(req.id, user.id); fetchAll(); }
    catch (e) { console.error('[pRewards] approve:', e); }
    finally { setProcessing(null); }
  };

  const decline = async (req: RewardRequest) => {
    if (!user) return;
    setProcessing(req.id);
    try { await rewardsService.rejectRewardRequest(req.id, user.id); fetchAll(); }
    catch (e) { console.error('[pRewards] reject:', e); }
    finally { setProcessing(null); }
  };

  const activate = async (item: Reward) => {
    if (!user) return;
    setActivating(item.id);
    try {
      await rewardsService.activateCatalogReward(user.id, item);
      setActivated(prev => new Set([...prev, item.title]));
      fetchAll();
    } catch (e) { console.error('[pRewards] activate:', e); }
    finally { setActivating(null); }
  };

  const eyebrow = (color = 'var(--rk-text3)'): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color, marginBottom: 12,
  });

  const SECTIONS = ['mine', 'catalog'] as const;
  const swipe = useSwipe({
    onLeft:  () => stepSection(SECTIONS, tab, 1, setTab),
    onRight: () => stepSection(SECTIONS, tab, -1, setTab),
  });

  const catalogFiltered = catalog.filter(c => matches(query, c.title, c.description));
  const mineFiltered = rewards.filter(r => matches(query, r.title, r.description));

  const byCategory = Object.entries(REWARD_CATEGORIES).map(([key, meta]) => ({
    key, meta, items: catalogFiltered.filter(c => (c.reward_type === 'catalog') && (c as Reward & { category?: string }).category === key),
  })).filter(g => g.items.length > 0);

  const catalogGroups = byCategory.length > 0
    ? byCategory
    : catalogFiltered.length > 0
      ? [{ key: 'all', meta: { label: 'Idées', color: '#FF9469', icon: 'compass' }, items: catalogFiltered }]
      : [];

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }} {...swipe}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 18px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Récompenses
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 14px' }}>
            Ce que les points permettent d'obtenir
          </p>
          <div style={{ display: 'flex', gap: 5, background: 'var(--rk-surface2)', padding: 4, borderRadius: 13 }}>
            <button onClick={() => setTab('mine')} style={{
              flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: 'center',
              background: tab === 'mine' ? 'var(--rk-surface)' : 'transparent',
              color: tab === 'mine' ? 'var(--rk-text)' : 'var(--rk-text3)',
            }}>Les miennes · {rewards.length}</button>
            <button onClick={() => setTab('catalog')} style={{
              flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: 'center',
              background: tab === 'catalog' ? 'var(--rk-surface)' : 'transparent',
              color: tab === 'catalog' ? 'var(--rk-text)' : 'var(--rk-text3)',
            }}>Idées</button>
          </div>
          <RkSearch
            value={query}
            onChange={setQuery}
            placeholder={tab === 'mine' ? 'Rechercher dans mes récompenses' : 'Rechercher une idée'}
            style={{ marginTop: 12 }}
          />
        </div>

        {/* ── Les miennes ─────────────────────────────────────── */}
        {tab === 'mine' && (
          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 22 }}>

            {requests.length > 0 && (
              <div>
                <div style={eyebrow('var(--rk-amber)')}>
                  DEMANDE{requests.length > 1 ? 'S' : ''} EN ATTENTE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {requests.map(req => {
                    const isImg = req.child?.avatar_url?.startsWith('/images/avatars/');
                    return (
                      <div key={req.id} style={{
                        background: 'var(--rk-surface)', border: '1.5px solid var(--rk-amber)',
                        borderRadius: 20, padding: 16,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                          {isImg ? (
                            <img src={req.child!.avatar_url!} alt="" style={{
                              width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#EDE7FF',
                            }} />
                          ) : (
                            <div style={{
                              width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: '#EDE7FF',
                              color: 'var(--rk-indigo)', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 15, fontWeight: 800,
                            }}>{req.child?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>
                              {req.reward?.title}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                              {req.child?.display_name} · {req.reward?.required_points} pts · {timeAgo(req.requested_at)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => approve(req)} disabled={processing === req.id} style={{
                            flex: 1, height: 44, borderRadius: 999, background: 'var(--rk-indigo)',
                            color: 'var(--rk-indigofg)', fontSize: 14, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: processing === req.id ? .6 : 1,
                          }}>Accorder</button>
                          <button onClick={() => decline(req)} disabled={processing === req.id} style={{
                            width: 100, height: 44, borderRadius: 999, border: '1.5px solid var(--rk-border)',
                            color: 'var(--rk-text)', fontSize: 14, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>Refuser</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div style={eyebrow()}>RÉCOMPENSES ACTIVES</div>
              {mineFiltered.length === 0 ? (
                <div style={{
                  background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                  borderRadius: 20, padding: '26px 18px', textAlign: 'center',
                  fontSize: 14, color: 'var(--rk-text3)', lineHeight: 1.5,
                }}>
                  {query
                    ? `Aucune récompense ne correspond à « ${query} ».`
                    : "Aucune récompense pour l'instant. Piochez dans les idées, c'est le plus rapide."}
                </div>
              ) : (
                <div style={{
                  background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                  borderRadius: 20, overflow: 'hidden',
                }}>
                  {mineFiltered.map((r, i) => {
                    const cat = (r as Reward & { category?: string }).category;
                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px',
                        borderBottom: i === mineFiltered.length - 1 ? 'none' : '1px solid var(--rk-line)',
                      }}>
                        <RkTile img="/images/menu/gift.png" size={36} radius={11}
                          tint={CATEGORY_TINT[cat ?? ''] ?? 'var(--rk-accentsoft)'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{r.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>
                            {REWARD_CATEGORIES[cat ?? '']?.label ?? r.description ?? 'Récompense'}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--rk-text)', flexShrink: 0 }}>
                          {r.required_points}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => history.push('/parent/create-reward')} style={{
              width: '100%', height: 52, borderRadius: 999, border: '1.5px dashed var(--rk-border)',
              color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}>
              <span style={{ fontSize: 19, lineHeight: 1 }}>+</span> Créer une récompense
            </button>
          </div>
        )}

        {/* ── Idées ───────────────────────────────────────────── */}
        {tab === 'catalog' && (
          <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ fontSize: 13, color: 'var(--rk-text2)', margin: 0, lineHeight: 1.6 }}>
              Des idées classées par nature. Les récompenses immatérielles marchent mieux que les objets :
              elles se répètent sans coût.
            </p>

            {catalogGroups.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--rk-text3)', fontSize: 13 }}>
                Aucune idée ne correspond{query ? ` à « ${query} »` : ''}.
              </div>
            )}
            {catalogGroups.map(group => (
              <div key={group.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                  <RkTile img="/images/menu/gift.png" size={30} radius={10}
                    tint={CATEGORY_TINT[group.key] ?? 'var(--rk-accentsoft)'} />
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.01em' }}>
                    {group.meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--rk-text3)', fontWeight: 600 }}>
                    {group.items.length} idée{group.items.length > 1 ? 's' : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map(item => {
                    const already = activated.has(item.title);
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--rk-surface)',
                        border: '1px solid var(--rk-border)', borderRadius: 16, padding: '13px 15px',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {item.title}
                            {already && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                                background: 'var(--rk-sagesoft)', color: 'var(--rk-sage)',
                              }}>déjà active</span>
                            )}
                          </div>
                          {item.description && (
                            <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>{item.description}</div>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--rk-text)', flexShrink: 0 }}>
                          {item.required_points}
                        </div>
                        {/* Toujours ré-ajoutable : une même idée peut servir à plusieurs enfants
                            ou être proposée à nouveau. */}
                        <button
                          onClick={() => activate(item)}
                          disabled={activating === item.id}
                          style={{
                            height: 32, padding: '0 13px', borderRadius: 999, flexShrink: 0,
                            fontSize: 12, fontWeight: 700,
                            background: 'var(--rk-indigosoft)', color: 'var(--rk-indigo)',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          {activating === item.id ? '…' : already ? 'Ajouter encore' : 'Ajouter'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </IonContent></IonPage>
  );
};

export default ParentRewardsPage;
