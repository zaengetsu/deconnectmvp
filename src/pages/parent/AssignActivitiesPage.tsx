import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { supabase } from '../../lib/supabase';
import { activitiesService } from '../../features/activities/activities.service';
import { childrenService } from '../../features/children/children.service';
import { CheckCircle, Circle, ArrowLeft } from 'lucide-react';
import type { Activity, Child } from '../../types/database.types';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#00B894',
  medium: '#F59E0B',
  hard: '#EF4444',
};
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
};

const AssignActivitiesPage: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const history = useHistory();
  const { user } = useAuthStore();

  const [child, setChild] = useState<Child | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [customActivities, setCustomActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeAssigned, setActiveAssigned] = useState<Set<string>>(new Set());   // en cours → bloqué
  const [activeStatuses, setActiveStatuses] = useState<Map<string, string>>(new Map()); // status par activité active
  const [completedCount, setCompletedCount] = useState<Map<string, number>>(new Map()); // historique
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!user) return;

      const [childData, catalogData, customData, assignedData] = await Promise.all([
        childrenService.getChild(childId),
        activitiesService.getActivities(),
        activitiesService.getParentCustomActivities(user.id),
        supabase
          .from('child_activities')
          .select('activity_id, status')
          .eq('child_id', childId),
      ]);

      setChild(childData);
      setActivities(catalogData);
      setCustomActivities(customData);

      const rows = (assignedData.data || []) as { activity_id: string; status: string }[];

      // Activités EN COURS → bloquées (ne peut pas ré-assigner)
      const activeRows = rows.filter(r => ['available', 'selected', 'submitted'].includes(r.status));
      const active = new Set(activeRows.map(r => r.activity_id));
      setActiveAssigned(active);

      // Map status détaillé pour chaque activité active
      const statuses = new Map<string, string>();
      activeRows.forEach(r => statuses.set(r.activity_id, r.status));
      setActiveStatuses(statuses);

      // Historique : nombre de fois validées par activité
      const counts = new Map<string, number>();
      rows.filter(r => r.status === 'validated').forEach(r => {
        counts.set(r.activity_id, (counts.get(r.activity_id) || 0) + 1);
      });
      setCompletedCount(counts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [childId]);
  useIonViewWillEnter(() => { fetchData(); });

  const toggle = (id: string) => {
    if (activeAssigned.has(id)) return; // en cours → bloqué
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await activitiesService.assignActivitiesToChild(childId, Array.from(selected));
      history.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'assignation');
    } finally {
      setSaving(false);
    }
  };

  const displayList = tab === 'catalog' ? activities : customActivities;
  const newSelected = [...selected].filter(id => !activeAssigned.has(id)).length;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ background: 'var(--dc-bg)', minHeight: '100vh', paddingBottom: 100 }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
            padding: '60px 24px 24px',
            color: 'white',
          }}>
            <button
              onClick={() => history.goBack()}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '8px 16px', color: 'white', fontSize: 14, cursor: 'pointer', marginBottom: 16 }}
            >
              <ArrowLeft size={14} style={{ marginRight: 6 }} />Retour
            </button>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
              Assigner des activités
            </h1>
            {child && (
              <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 14 }}>
                Pour {child.display_name} · {newSelected > 0 ? `${newSelected} sélectionnée${newSelected > 1 ? 's' : ''}` : 'Sélectionnez des activités'}
              </p>
            )}
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {([['catalog', 'Catalogue'], ['custom', 'Mes activités']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: `2px solid ${tab === t ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                  background: tab === t ? 'rgba(108,92,231,0.08)' : 'white',
                  color: tab === t ? 'var(--dc-primary)' : 'var(--dc-text-light)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', marginBottom: 16, color: '#DC2626', fontSize: 13 }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--dc-text-light)' }}>Chargement...</div>
            ) : displayList.length === 0 ? (
              <div className="dc-card" style={{ textAlign: 'center', padding: 32, color: 'var(--dc-text-light)' }}>
                {tab === 'custom' ? 'Aucune activité personnalisée créée' : 'Aucune activité dans le catalogue'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayList.map(activity => {
                  const isActive = activeAssigned.has(activity.id); // en cours
                  const timesCompleted = completedCount.get(activity.id) || 0;
                  const isSelected = selected.has(activity.id);
                  return (
                    <button
                      key={activity.id}
                      onClick={() => toggle(activity.id)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: isActive ? 'rgba(245,158,11,0.05)' : isSelected ? 'rgba(108,92,231,0.07)' : 'white',
                        border: `2px solid ${isActive ? 'rgba(245,158,11,0.35)' : isSelected ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
                        borderRadius: 14, padding: '14px 16px',
                        cursor: isActive ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 14,
                        transition: 'all 0.15s',
                        opacity: isActive ? 0.75 : 1,
                      }}
                    >
                      <div style={{ flexShrink: 0, color: isActive ? '#F59E0B' : isSelected ? 'var(--dc-primary)' : 'var(--dc-border)' }}>
                        <CheckCircle size={22} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--dc-text)' }}>{activity.title}</div>
                        {activity.description && (
                          <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activity.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-primary)', background: 'rgba(108,92,231,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                            +{activity.points} pts
                          </span>
                          {activity.difficulty && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: DIFFICULTY_COLORS[activity.difficulty] || '#888', background: `${DIFFICULTY_COLORS[activity.difficulty] || '#888'}15`, padding: '2px 8px', borderRadius: 20 }}>
                              {DIFFICULTY_LABELS[activity.difficulty] || activity.difficulty}
                            </span>
                          )}
                          {isActive && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                              ⏳ {activeStatuses.get(activity.id) === 'available' ? 'Assignée (pas commencée)'
                                : activeStatuses.get(activity.id) === 'selected' ? 'En cours'
                                : 'Soumise (en attente)'}
                            </span>
                          )}
                          {timesCompleted > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#00B894', background: 'rgba(0,184,148,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                              ✓ {timesCompleted}× réalisée
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom bar */}
        {newSelected > 0 && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'white', padding: '16px 20px 32px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
            display: 'flex', gap: 12,
          }}>
            <button
              className="dc-btn dc-btn-outline"
              style={{ flex: 1 }}
              onClick={() => setSelected(new Set())}
            >
              Effacer
            </button>
            <button
              className="dc-btn dc-btn-primary"
              style={{ flex: 2, opacity: saving ? 0.7 : 1 }}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Assignation...' : `Assigner ${newSelected} activité${newSelected > 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default AssignActivitiesPage;
