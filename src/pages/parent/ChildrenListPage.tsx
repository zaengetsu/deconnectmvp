import React, { useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import type { Child } from '../../types/database.types';

const LEVEL_NAMES = ['', 'Explorateur', 'Aventurier', 'Champion', 'Héros', 'Légende', 'Super Héros', 'Maître', 'Expert', 'Prodige', 'Légende'];

const isHexColor = (v?: string | null) => !!v && /^#[0-9A-Fa-f]{3,8}$/.test(v);
const isImageUrl = (v?: string | null) => !!v && v.startsWith('/images/avatars/');

const ChildAvatar = ({ child, size = 60 }: { child: { avatar_url?: string | null; display_name: string }; size?: number }) => {
  const url = child.avatar_url;
  if (isImageUrl(url)) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden', background: '#EDE7FF',
        boxShadow: '0 2px 10px rgba(108,92,231,0.2)',
      }}>
        <img src={url!} alt={child.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  const isColor = isHexColor(url);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: isColor ? url! : 'linear-gradient(135deg, rgba(108,92,231,0.15), rgba(0,206,201,0.15))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 900, color: isColor ? 'white' : undefined,
      boxShadow: isColor ? `0 2px 10px ${url}60` : undefined,
    }}>
      {isColor ? child.display_name[0]?.toUpperCase() ?? '?' : '?'}
    </div>
  );
};


const ChildrenListPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChildren = () => {
    if (!user) { setLoading(false); return; }
    childrenService.getChildren(user.id)
      .then(setChildren)
      .catch(err => console.error('[ChildrenList] fetch error:', err))
      .finally(() => setLoading(false));
  };

  // useIonViewWillEnter covers both initial mount AND subsequent returns
  useIonViewWillEnter(fetchChildren);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ background: 'var(--dc-bg)', minHeight: '100vh', padding: '0 0 100px' }}>
          {/* Header */}
          <div className="dc-page-header">
            <div className="dc-header-row">
              <img src="/images/menu/team-management.png" alt="enfants" style={{ width: 26, height: 26, objectFit: 'contain' }} />
              <h1>Mes enfants</h1>
            </div>
            <p>{loading ? '...' : `${children.length} profil${children.length > 1 ? 's' : ''}`}</p>
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            {/* Add button */}
            <button
              className="dc-btn dc-btn-primary dc-btn-full"
              style={{ marginBottom: 20, fontSize: 15 }}
              onClick={() => history.push('/parent/create-child')}
            >
              + Ajouter un enfant
            </button>

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--dc-text-light)' }}>
                Chargement...
              </div>
            )}

            {/* Empty state */}
            {!loading && children.length === 0 && (
              <div className="dc-empty-state">
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <img src="/images/menu/team-management.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                </div>
                <h3>Aucun profil enfant</h3>
                <p>Créez le premier profil pour commencer l'aventure !</p>
              </div>
            )}

            {/* Children list */}
            {children.map(child => {
              const progress = Math.min(100, (child.total_points % 100));
              return (
                <div key={child.id} className="dc-card dc-animate-in"
                  style={{ marginBottom: 14, cursor: 'pointer' }}
                  onClick={() => history.push(`/parent/children/${child.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Avatar */}
                    <ChildAvatar child={child} size={60} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{child.display_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginBottom: 6 }}>
                        {child.age} ans • Niveau {child.level} — {LEVEL_NAMES[child.level] || 'Pro'}
                      </div>
                      {/* Progress bar */}
                      <div className="dc-progress-bar" style={{ height: 6 }}>
                        <div className="dc-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>

                    {/* Points badge */}
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--dc-primary)' }}>{child.total_points}</div>
                      <div style={{ fontSize: 10, color: 'var(--dc-text-muted)', fontWeight: 600 }}>pts</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildrenListPage;
