import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { rewardsService } from '../../features/rewards/rewards.service';
import type { Child, ChildActivity, RewardRequest } from '../../types/database.types';

const QUICK_ACTIONS = [
  { imgSrc: '/images/menu/book.png', label: 'Catalogue', path: '/parent/activities' },
  { imgSrc: '/images/menu/puzzle.png', label: 'Créer activité', path: '/parent/create-activity' },
];

const ParentDashboard: React.FC = () => {
  const { profile, user } = useAuthStore();
  const history = useHistory();
  const [children, setChildren] = useState<Child[]>([]);
  const [pending, setPending] = useState<ChildActivity[]>([]);
  const [rewardReqs, setRewardReqs] = useState<RewardRequest[]>([]);

  const fetchAll = () => {
    console.log('[Dashboard] fetchAll — user:', user?.id ?? 'NULL');
    if (!user) return;
    childrenService.getChildren(user.id).then(setChildren).catch((e) => console.error('[Dashboard] children error:', e));
    activitiesService.getPendingValidations(user.id).then(setPending).catch((e) => console.error('[Dashboard] pending error:', e));
    rewardsService.getPendingRewardRequests(user.id).then(setRewardReqs).catch((e) => console.error('[Dashboard] rewards error:', e));
  };

  // Re-fetch when user becomes available after a momentary null (token refresh)
  useEffect(() => {
    console.log('[Dashboard] user changed ->', user?.id ?? 'null');
    if (user) fetchAll();
  }, [user?.id]);

  useIonViewWillEnter(() => {
    console.log('[Dashboard] useIonViewWillEnter fired');
    fetchAll();
  });

  const firstName = profile?.full_name?.split(' ')[0] || 'Parent';

  return (
    <IonPage><IonContent fullscreen>
      <div className="dc-page-header">
        <div className="dc-header-row">
          <img src="/images/menu/home.png" alt="accueil" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          <h1>Bonjour {firstName}</h1>
        </div>
      </div>
      <div style={{ padding: '20px 20px 100px' }}>

        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <div className="dc-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--dc-primary)' }}>{children.length}</div>
            <div style={{ fontSize: 11, color: 'var(--dc-text-light)', fontWeight: 600 }}>Enfants</div>
          </div>
          <div className="dc-card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => history.push('/parent/validations')}>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--dc-warning)' }}>{pending.length}</div>
            <div style={{ fontSize: 11, color: 'var(--dc-text-light)', fontWeight: 600 }}>En attente</div>
          </div>
          <div className="dc-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--dc-accent)' }}>{rewardReqs.length}</div>
            <div style={{ fontSize: 11, color: 'var(--dc-text-light)', fontWeight: 600 }}>Demandes</div>
          </div>
        </div>

        {/* Children – carrousel horizontal */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="dc-section-title" style={{ margin: 0 }}>Mes enfants</h2>
            <button
              className="dc-btn"
              style={{ padding: '8px 16px', fontSize: 13, background: 'var(--dc-primary)', color: 'white', borderRadius: 50 }}
              onClick={() => history.push('/parent/create-child')}
            >
              + Ajouter
            </button>
          </div>

          {children.length === 0 ? (
            <div className="dc-card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ color: 'var(--dc-text-light)', fontSize: 14, margin: 0 }}>Ajoutez votre premier enfant</p>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: 12,
                overflowX: 'auto',
                paddingBottom: 8,
                /* Masquer la scrollbar visuellement tout en gardant le défilement */
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {children.map(child => (
                <div
                  key={child.id}
                  className="dc-card dc-animate-in"
                  onClick={() => history.push(`/parent/children/${child.id}`)}
                  style={{
                    flexShrink: 0,
                    width: 150,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    padding: '20px 12px',
                    textAlign: 'center',
                  }}
                >
                  {/* Avatar */}
                  {child.avatar_url?.startsWith('/images/avatars/') ? (
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      overflow: 'hidden', background: '#EDE7FF', flexShrink: 0,
                      boxShadow: '0 2px 10px rgba(108,92,231,0.2)',
                    }}>
                      <img src={child.avatar_url} alt={child.display_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ) : (
                    <div
                      className="dc-avatar"
                      style={{
                        width: 52, height: 52, fontSize: 22, fontWeight: 900, flexShrink: 0,
                        background: /^#[0-9A-Fa-f]{3,8}$/.test(child.avatar_url || '') ? child.avatar_url! : undefined,
                      }}
                    >
                      {child.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}

                  {/* Nom */}
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
                    {child.display_name}
                  </div>

                  {/* Infos */}
                  <div style={{ fontSize: 11, color: 'var(--dc-text-light)', lineHeight: 1.4 }}>
                    {child.age} ans · Niv.{child.level}
                  </div>

                  {/* Points */}
                  <div
                    style={{
                      background: 'rgba(108,92,231,0.08)',
                      borderRadius: 50,
                      padding: '4px 12px',
                      fontSize: 13,
                      fontWeight: 800,
                      color: 'var(--dc-primary)',
                    }}
                  >
                    {child.total_points} pts
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <h2 className="dc-section-title">Actions rapides</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {QUICK_ACTIONS.map(({ imgSrc, label, path }) => (
            <div
              key={path}
              className="dc-card"
              onClick={() => history.push(path)}
              style={{
                flex: 1, cursor: 'pointer',
                padding: '16px 10px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 8,
                textAlign: 'center',
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {imgSrc
                  ? <img src={imgSrc} alt={label} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  : <img src="/images/menu/puzzle.png" alt={label} style={{ width: 22, height: 22, objectFit: 'contain' }} />}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ParentDashboard;
