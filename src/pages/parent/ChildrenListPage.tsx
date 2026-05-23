import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import type { Child } from '../../types/database.types';

const LEVEL_NAMES = ['', 'Explorateur', 'Aventurier', 'Champion', 'Héros', 'Légende', 'Super Héros', 'Maître', 'Expert', 'Prodige', 'Légende'];

const ChildrenListPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    childrenService.getChildren(user.id)
      .then(setChildren)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ background: 'var(--dc-bg)', minHeight: '100vh', padding: '0 0 100px' }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
            padding: '60px 24px 28px', color: 'white',
          }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 4px' }}>Mes enfants</h1>
            <p style={{ opacity: 0.85, fontSize: 14, margin: 0 }}>
              {loading ? '...' : `${children.length} profil${children.length > 1 ? 's' : ''}`}
            </p>
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
                <div className="emoji">👨‍👩‍👧‍👦</div>
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
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%', fontSize: 32,
                      background: 'linear-gradient(135deg, rgba(108,92,231,0.15), rgba(0,206,201,0.15))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {child.avatar_url || '🦊'}
                    </div>

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
