import React from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAppStore } from '../../stores/app.store';
import { gamificationService } from '../../features/gamification/gamification.service';

const ChildProfilePage: React.FC = () => {
  const { selectedChild, switchToParent } = useAppStore();
  const history = useHistory();

  if (!selectedChild) return null;

  const progress = gamificationService.getLevelProgress(selectedChild.total_points);

  return (
    <IonPage><IonContent fullscreen>
      <div style={{ padding: '20px 20px 100px' }}>
        <div className="dc-page-header"><h1>Mon Profil</h1></div>

        <div className="dc-card" style={{ textAlign: 'center', padding: 32, marginBottom: 24 }}>
          <div className="dc-avatar dc-avatar-lg" style={{ margin: '0 auto 16px', fontSize: 28 }}>
            {selectedChild.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>{selectedChild.display_name}</h2>
          <p style={{ color: 'var(--dc-text-light)', margin: 0 }}>{selectedChild.age} ans</p>
        </div>

        <div className="dc-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700 }}>Niveau {selectedChild.level}</span>
            <span style={{ color: 'var(--dc-primary)', fontWeight: 700 }}>{selectedChild.total_points} pts</span>
          </div>
          <div className="dc-progress-bar"><div className="dc-progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>

        <button className="dc-btn dc-btn-outline dc-btn-full" style={{ marginTop: 16 }}
          onClick={() => { switchToParent(); history.replace('/parent'); }}>
          ← Retour à l'espace parent
        </button>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildProfilePage;
