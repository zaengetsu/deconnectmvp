import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useAppStore } from '../../stores/app.store';
import { childrenService } from '../../features/children/children.service';
import type { Child } from '../../types/database.types';
import { Users } from 'lucide-react';

const ChildSelectorPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const { selectChild } = useAppStore();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      childrenService.getChildren(user.id).then(c => { setChildren(c); setLoading(false); });
    }
  }, [user]);

  const handleSelect = (child: Child) => {
    selectChild(child);
    history.replace('/child');
  };

  return (
    <IonPage><IonContent fullscreen>
      <div style={{ minHeight: '100vh', padding: '60px 24px', background: 'var(--dc-bg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900 }}>Qui joue ?</h1>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 14 }}>Choisis ton profil</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>Chargement...</div>
        ) : children.length === 0 ? (
          <div className="dc-empty-state">
            <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Users size={28} color="var(--dc-blue)" strokeWidth={1.5} />
            </div>
            <h3>Aucun profil enfant</h3>
            <p>Demande à ton parent de créer ton profil</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {children.map(child => (
              <button key={child.id} className="dc-card dc-animate-in" onClick={() => handleSelect(child)}
                style={{ textAlign: 'center', border: 'none', cursor: 'pointer', padding: 24 }}>
                <div className="dc-avatar dc-avatar-lg" style={{ margin: '0 auto 12px', fontSize: 24, fontWeight: 900 }}>
                  {child.display_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{child.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginTop: 4 }}>{child.total_points} pts • Niv. {child.level}</div>
              </button>
            ))}
          </div>
        )}

        <button className="dc-btn dc-btn-outline dc-btn-full" style={{ marginTop: 32 }}
          onClick={() => { history.push('/parent'); }}>
          ← Espace parent
        </button>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildSelectorPage;
