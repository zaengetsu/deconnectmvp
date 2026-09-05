import RkEmpty from '../../components/rk/RkEmpty';
import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { childrenService } from '../../features/children/children.service';
import { gamificationService, getRealStreak } from '../../features/gamification/gamification.service';
import type { Child } from '../../types/database.types';

/** Mes enfants — porté de la maquette Rekonect (écran pKids). */

const ChildrenListPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [children, setChildren] = useState<Child[]>([]);

  const load = () => {
    if (!user) return;
    childrenService.getChildren(user.id).then(setChildren).catch(e => console.error('[pKids]', e));
  };

  useEffect(load, [user?.id]);
  useIonViewWillEnter(load);

  const stat = (value: React.ReactNode, label: string, color = 'var(--rk-text)') => (
    <div style={{ flex: 1, background: 'var(--rk-surface2)', borderRadius: 14, padding: '10px 12px' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--rk-text3)', marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Mes enfants
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            {children.length} profil{children.length > 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {children.length === 0 && (
            <RkEmpty
              img="/images/categories/family.png"
              tint="var(--rk-accentsoft)"
              title="Aucun profil enfant"
              text="Créez un profil par enfant : il aura son propre espace, ses activités, ses points et ses récompenses."
              cta={{ label: 'Ajouter un enfant', onClick: () => history.push('/parent/create-child') }}
            />
          )}
          {children.map(child => {
            const level = gamificationService.calculateLevel(child.total_points);
            const streak = getRealStreak(child.streak_days || 0, child.last_activity_date);
            const linked = !!child.auth_user_id;
            const isImg = child.avatar_url?.startsWith('/images/avatars/');

            return (
              <button
                key={child.id}
                onClick={() => history.push(`/parent/children/${child.id}`)}
                style={{
                  display: 'block', width: '100%', background: 'var(--rk-surface)',
                  border: '1px solid var(--rk-border)', borderRadius: 20, padding: 18,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {isImg ? (
                    <img src={child.avatar_url!} alt="" style={{
                      width: 54, height: 54, borderRadius: '50%', objectFit: 'cover',
                      flexShrink: 0, background: '#EDE7FF',
                    }} />
                  ) : (
                    <div style={{
                      width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
                      background: /^#[0-9A-Fa-f]{3,8}$/.test(child.avatar_url || '') ? child.avatar_url! : '#EDE7FF',
                      color: 'var(--rk-indigo)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 21, fontWeight: 800,
                    }}>{child.display_name[0]?.toUpperCase()}</div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)' }}>
                      {child.display_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 3 }}>
                      {child.age} ans · appareil {linked ? 'lié' : 'non lié'}
                    </div>
                  </div>

                  <div style={{
                    height: 26, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0,
                    background: linked ? 'var(--rk-sagesoft)' : 'var(--rk-ambersoft)',
                    color: linked ? 'var(--rk-sage)' : 'var(--rk-amber)',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center',
                  }}>
                    {linked ? 'Actif' : 'À lier'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {stat(child.total_points, 'POINTS')}
                  {stat(level, 'NIVEAU')}
                  {stat(streak, 'SÉRIE', streak > 0 ? 'var(--rk-accent)' : 'var(--rk-text3)')}
                </div>
              </button>
            );
          })}

          <button
            onClick={() => history.push('/parent/create-child')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              width: '100%', height: 56, borderRadius: 20, border: '1.5px dashed var(--rk-border)',
              color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700, marginTop: 6,
            }}
          >
            <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1 }}>+</span> Ajouter un enfant
          </button>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildrenListPage;
