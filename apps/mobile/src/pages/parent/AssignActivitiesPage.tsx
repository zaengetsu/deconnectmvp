import { useRkBack } from '../../hooks/useRkBack';
import React, { useEffect, useMemo, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { getCategoryStyle } from '../../lib/categoryStyle';
import RkSearch from '../../components/rk/RkSearch';
import { matches } from '../../lib/search';
import type { Activity, ActivityCategory, Child, ChildActivity } from '../../types/database.types';

/** Assigner des activités — porté de la maquette Rekonect (écran pAssign). */

const TINTS = ['var(--rk-indigosoft)', 'var(--rk-sagesoft)', 'var(--rk-accentsoft)', 'var(--rk-ambersoft)'];

const AssignActivitiesPage: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const history = useHistory();
  const back = useRkBack(`/parent/children/${childId}`);

  const [child, setChild] = useState<Child | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [history_, setHistory_] = useState<ChildActivity[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    childrenService.getChild(childId).then(setChild).catch(() => {});
    activitiesService.getActivities().then(setActivities).catch(() => {});
    activitiesService.getCategories().then(setCategories).catch(() => {});
    activitiesService.getChildActivities(childId).then(setHistory_).catch(() => {});
  }, [childId]);

  const visible = useMemo(
    () => activities
      .filter(a => cat === 'all' || a.category_id === cat)
      .filter(a => matches(query, a.title, a.description, a.category?.name)),
    [activities, cat, query],
  );

  // Ce que l'enfant a déjà de cette activité : en cours (à faire / commencée /
  // envoyée) ou déjà réalisée. Informatif seulement — on peut toujours ré-assigner.
  const stateOf = useMemo(() => {
    const map = new Map<string, { active: number; done: number }>();
    for (const ca of history_) {
      const cur = map.get(ca.activity_id) ?? { active: 0, done: 0 };
      if (ca.status === 'available' || ca.status === 'selected' || ca.status === 'submitted') cur.active += 1;
      if (ca.status === 'validated') cur.done += 1;
      map.set(ca.activity_id, cur);
    }
    return map;
  }, [history_]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const assign = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await activitiesService.assignActivitiesToChild(childId, [...selected]);
      history.replace(`/parent/children/${childId}`);
    } catch (e) {
      console.error('[pAssign]', e);
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = [...selected].reduce((sum, id) => {
    const a = activities.find(x => x.id === id);
    return sum + (a?.points ?? 0);
  }, 0);

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={() => back()} style={{
            fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
          }}>← {child?.display_name ?? 'Retour'}</button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Assigner
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            Sélectionnez les activités pour {child?.display_name ?? 'votre enfant'}
          </p>
        </div>

        <div style={{ padding: '18px 22px 200px' }}>
          <RkSearch value={query} onChange={setQuery} placeholder="Rechercher une activité" style={{ marginBottom: 14 }} />
          <div className="rk-sc" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 14 }}>
            {[{ id: 'all', name: 'Toutes' }, ...categories].map(c => {
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

          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--rk-text3)', fontSize: 13 }}>
              Aucune activité ne correspond{query ? ` à « ${query} »` : ''}.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map((a, i) => {
              const on = selected.has(a.id);
              const st = getCategoryStyle(a.category?.slug);
              return (
                <button key={a.id} onClick={() => toggle(a.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                  background: 'var(--rk-surface)', borderRadius: 18, padding: 13,
                  border: on ? '1.5px solid var(--rk-indigo)' : '1px solid var(--rk-border)',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                    background: on ? 'var(--rk-indigo)' : 'transparent',
                    border: on ? 'none' : '2px solid var(--rk-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && (
                      <div style={{
                        width: 11, height: 6, borderLeft: '2.5px solid #fff', borderBottom: '2.5px solid #fff',
                        transform: 'rotate(-45deg) translate(1px,-2px)',
                      }} />
                    )}
                  </div>

                  <div style={{
                    width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                    background: TINTS[i % TINTS.length],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src={st.imgSrc} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {a.category?.name ?? 'Activité'}
                      {a.duration_minutes ? ` · ${a.duration_minutes} min` : ''}
                    </div>
                    {(() => {
                      const st2 = stateOf.get(a.id);
                      if (!st2 || (st2.active === 0 && st2.done === 0)) return null;
                      return (
                        <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                          {st2.active > 0 && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                              background: 'var(--rk-ambersoft)', color: 'var(--rk-text2)',
                            }}>en cours{st2.active > 1 ? ` ×${st2.active}` : ''}</span>
                          )}
                          {st2.done > 0 && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                              background: 'var(--rk-sagesoft)', color: 'var(--rk-text2)',
                            }}>faite {st2.done > 1 ? `×${st2.done}` : 'une fois'}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--rk-text)', flexShrink: 0 }}>
                    {a.points}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Barre d'action fixe : la sélection reste visible pendant le défilement */}
        {selected.size > 0 && (
          <div style={{
            position: 'fixed', left: 0, right: 0, zIndex: 45,
            bottom: 'var(--rk-tabbar-h)',
            padding: '14px 22px 18px',
            background: 'var(--rk-surface)', borderTop: '1px solid var(--rk-border)',
          }}>
            <button onClick={assign} disabled={saving} style={{
              width: '100%', height: 52, borderRadius: 999, background: 'var(--rk-indigo)',
              color: 'var(--rk-indigofg)', fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: saving ? .6 : 1,
            }}>
              {saving ? 'Attribution…' : `Assigner ${selected.size} activité${selected.size > 1 ? 's' : ''} · ${totalPoints} pts`}
            </button>
          </div>
        )}
      </div>
    </IonContent></IonPage>
  );
};

export default AssignActivitiesPage;
