import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import { getCategoryStyle } from '../../lib/categoryStyle';
import type { Activity, ActivityCategory } from '../../types/database.types';

/** Catalogue d'activités — porté de la maquette Rekonect (écran pCatalog). */

const TINTS = ['var(--rk-accentsoft)', 'var(--rk-sagesoft)', 'var(--rk-indigosoft)', 'var(--rk-ambersoft)', 'var(--rk-raspsoft)'];

const DIFFICULTY = {
  easy:   { label: 'Facile',    color: 'var(--rk-sage)' },
  medium: { label: 'Moyen',     color: 'var(--rk-amber)' },
  hard:   { label: 'Difficile', color: 'var(--rk-rasp)' },
} as const;

const ActivityCatalogPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const back = useRkBack('/parent/dashboard');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');

  const load = () => {
    activitiesService.getActivities().then(setActivities).catch(() => {});
    activitiesService.getCategories().then(setCategories).catch(() => {});
    if (user) {
      activitiesService.getParentCustomActivities(user.id)
        .then(custom => setActivities(prev => {
          const ids = new Set(prev.map(a => a.id));
          return [...custom.filter(c => !ids.has(c.id)), ...prev];
        }))
        .catch(() => {});
    }
  };

  useEffect(load, [user?.id]);
  useIonViewWillEnter(load);

  const visible = useMemo(() => activities
    .filter(a => cat === 'all' || a.category_id === cat)
    .filter(a => !query || a.title.toLowerCase().includes(query.toLowerCase())),
  [activities, cat, query]);

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 18px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={back} style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12 }}>← Accueil</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Catalogue
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 14px' }}>
            {activities.length} activités · {categories.length} catégories
          </p>

          <div style={{
            height: 44, borderRadius: 14, background: 'var(--rk-surface2)',
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid var(--rk-text3)', flexShrink: 0,
            }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher une activité"
              style={{
                flex: 1, border: 'none', background: 'transparent', outline: 'none',
                fontSize: 14, fontFamily: 'inherit', color: 'var(--rk-text)',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '16px 0 140px' }}>
          <div className="rk-sc" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 22px 16px' }}>
            {[{ id: 'all', name: 'Tout' }, ...categories].map(c => {
              const on = cat === c.id;
              return (
                <button key={c.id} onClick={() => setCat(c.id)} style={{
                  height: 34, padding: '0 15px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center',
                  background: on ? 'var(--rk-indigo)' : 'var(--rk-surface)',
                  border: on ? 'none' : '1px solid var(--rk-border)',
                  color: on ? 'var(--rk-indigofg)' : 'var(--rk-text2)',
                }}>{c.name}</button>
              );
            })}
          </div>

          <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {visible.map((a, i) => {
              const st = getCategoryStyle(a.category?.slug);
              const diff = DIFFICULTY[(a.difficulty as keyof typeof DIFFICULTY)] ?? DIFFICULTY.easy;
              return (
                <div key={a.id} style={{
                  background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                  borderRadius: 20, padding: 14,
                }}>
                  <div style={{
                    height: 64, borderRadius: 14, background: TINTS[i % TINTS.length],
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                  }}>
                    <img src={st.imgSrc} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text)', lineHeight: 1.3, minHeight: 34 }}>
                    {a.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--rk-text)' }}>{a.points} pts</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: diff.color }}>{diff.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 22px', color: 'var(--rk-text3)', fontSize: 14 }}>
              Aucune activité ne correspond.
            </div>
          )}

          <div style={{ padding: '18px 22px 0' }}>
            <button onClick={() => history.push('/parent/create-activity')} style={{
              width: '100%', height: 52, borderRadius: 999, border: '1.5px dashed var(--rk-border)',
              color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            }}>
              <span style={{ fontSize: 19, lineHeight: 1 }}>+</span> Créer une activité
            </button>
          </div>
        </div>
      </div>
    </IonContent></IonPage>
  );
};

export default ActivityCatalogPage;
