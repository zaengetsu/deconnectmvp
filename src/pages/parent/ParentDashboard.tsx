import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { rewardsService } from '../../features/rewards/rewards.service';
import { BookOpen, PlusCircle, Gift, ArrowRight, UserCircle } from 'lucide-react';
import type { Child, ChildActivity, RewardRequest } from '../../types/database.types';

const QUICK_ACTIONS = [
  { icon: BookOpen,    label: 'Catalogue',     path: '/parent/activities' },
  { icon: PlusCircle,  label: 'Créer activité', path: '/parent/create-activity' },
  { icon: Gift,        label: 'Récompenses',   path: '/parent/rewards' },
  { icon: UserCircle,  label: 'Espace enfant', path: '/select-child' },
];

const ParentDashboard: React.FC = () => {
  const { profile } = useAuthStore();
  const history = useHistory();
  const [children, setChildren] = useState<Child[]>([]);
  const [pending, setPending] = useState<ChildActivity[]>([]);
  const [rewardReqs, setRewardReqs] = useState<RewardRequest[]>([]);

  useEffect(() => {
    if (profile) {
      childrenService.getChildren(profile.id).then(setChildren);
      activitiesService.getPendingValidations(profile.id).then(setPending);
      rewardsService.getPendingRewardRequests(profile.id).then(setRewardReqs);
    }
  }, [profile]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Parent';

  return (
    <IonPage><IonContent fullscreen>
      <div style={{ padding: '20px 20px 100px' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)', borderRadius: 'var(--dc-radius-lg)', padding: '28px 24px', color: 'white', marginBottom: 24 }}>
          <p style={{ fontSize: 13, opacity: 0.85, margin: 0, fontWeight: 500 }}>Bonjour</p>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '4px 0 0' }}>{firstName}</h1>
        </div>

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

        {/* Children */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="dc-section-title" style={{ margin: 0 }}>Mes enfants</h2>
            <button className="dc-btn" style={{ padding: '8px 16px', fontSize: 13, background: 'var(--dc-primary)', color: 'white', borderRadius: 50 }}
              onClick={() => history.push('/parent/create-child')}>+ Ajouter</button>
          </div>
          {children.length === 0 ? (
            <div className="dc-card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ color: 'var(--dc-text-light)', fontSize: 14, margin: 0 }}>Ajoutez votre premier enfant</p>
            </div>
          ) : children.map(child => (
            <div key={child.id} className="dc-card dc-animate-in" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, cursor: 'pointer' }}
              onClick={() => history.push(`/parent/children/${child.id}`)}>
              <div className="dc-avatar" style={{ fontSize: 18, fontWeight: 900 }}>
                {child.display_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{child.display_name}</div>
                <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>{child.age} ans · Niveau {child.level}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--dc-primary)' }}>{child.total_points}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>pts</div>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <h2 className="dc-section-title">Actions rapides</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {QUICK_ACTIONS.map(({ icon: Icon, label, path }) => (
            <div key={path} className="dc-card" style={{ cursor: 'pointer', padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => history.push(path)}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color="var(--dc-primary)" strokeWidth={2} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{label}</div>
              <ArrowRight size={14} color="var(--dc-text-muted)" />
            </div>
          ))}
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ParentDashboard;
