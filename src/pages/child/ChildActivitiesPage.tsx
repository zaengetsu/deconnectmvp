import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { activitiesService } from '../../features/activities/activities.service';
import { storageService, type UploadedProof } from '../../features/storage/storage.service';
import { emailService } from '../../features/notifications/email.service';
import { useAuthStore } from '../../stores/auth.store';
import ProofUpload from '../../components/ui/ProofUpload';
import { getCategoryStyle, PointsBadge, DifficultyBadge } from '../../components/ui/ChildUIKit';
import type { Activity, ActivityCategory, ChildActivity } from '../../types/database.types';
import { Search, ChevronRight } from 'lucide-react';

/* ─── Submit Modal ────────────────────────────────────────── */
interface SubmitModalProps {
  ca: ChildActivity;
  childId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const SubmitModal: React.FC<SubmitModalProps> = ({ ca, childId, onClose, onSubmitted }) => {
  const { profile } = useAuthStore();
  const { selectedChild } = useAppStore();
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<UploadedProof | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await activitiesService.submitActivity(ca.id, note || undefined, proof?.url, proof?.type);
      if (profile?.email && profile?.full_name && selectedChild) {
        emailService.sendActivitySubmitted(profile.email, profile.full_name, selectedChild.display_name, ca.activity?.title || 'une activité');
      }
      if (selectedChild) {
        const { notificationService } = await import('../../features/notifications/notification.service');
        notificationService.createNotification(
          'parent', selectedChild.parent_id,
          'Activité à valider',
          `${selectedChild.display_name} a terminé "${ca.activity?.title || 'une activité'}"`,
          'check', '/parent/validations',
          { type: 'activity_submitted', child_id: childId }
        ).catch(() => {});
      }
      onSubmitted();
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const { accent } = getCategoryStyle(ca.activity?.category?.slug);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '28px 28px 0 0', padding: '24px 24px 40px', width: '100%', maxWidth: 600, animation: 'dc-slide-up 0.35s ease' }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: 'var(--dc-border)', borderRadius: 4, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(() => { const { Icon } = getCategoryStyle(ca.activity?.category?.slug); return <Icon size={22} color={accent} strokeWidth={2} />; })()}
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Activité terminée !</h2>
            <p style={{ color: 'var(--dc-text-light)', fontSize: 13, margin: 0 }}>{ca.activity?.title}</p>
          </div>
        </div>

        <ProofUpload childId={childId} childActivityId={ca.id} onUploadComplete={setProof} onRemove={async () => { if (proof) { await storageService.deleteActivityProof(proof.path).catch(() => {}); setProof(null); } }} currentProof={proof} />

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            Commentaire <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(optionnel)</span>
          </label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Dis à tes parents comment ça s'est passé..."
            rows={3} maxLength={200}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '2px solid var(--dc-border)', background: 'var(--dc-bg)', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        <button className="dc-btn dc-btn-green dc-btn-full dc-btn-lg" disabled={submitting} onClick={handleSubmit} style={{ opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Envoi...' : 'Envoyer pour validation'}
        </button>
        <button className="dc-btn dc-btn-ghost dc-btn-full" style={{ marginTop: 8 }} onClick={onClose}>Annuler</button>
      </div>
    </div>
  );
};

/* ─── Main Page ───────────────────────────────────────────── */
const ChildActivitiesPage: React.FC = () => {
  const { selectedChild } = useAppStore();
  const [activities, setActivities]       = useState<Activity[]>([]);
  const [myActivities, setMyActivities]   = useState<ChildActivity[]>([]);
  const [categories, setCategories]       = useState<ActivityCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [tab, setTab]                     = useState<'catalog' | 'mine'>('catalog');
  const [submitTarget, setSubmitTarget]   = useState<ChildActivity | null>(null);
  const [search, setSearch]               = useState('');

  const loadMyActivities = () => {
    if (selectedChild) activitiesService.getChildActivities(selectedChild.id).then(setMyActivities);
  };

  useEffect(() => {
    activitiesService.getCategories().then(setCategories);
    activitiesService.getActivities().then(setActivities);
    loadMyActivities();
  }, [selectedChild]);

  const handleSelect = async (activity: Activity) => {
    if (!selectedChild) return;
    await activitiesService.selectActivity(selectedChild.id, activity.id);
    loadMyActivities();
    setTab('mine');
  };

  const filtered = activities
    .filter(a => !activeCategory || a.category_id === activeCategory)
    .filter(a => !search || a.title.toLowerCase().includes(search.toLowerCase()));

  if (!selectedChild) return null;

  const myStatusLabel = (ca: ChildActivity) => {
    if (ca.status === 'validated') return `+${ca.earned_points} pts gagnés !`;
    if (ca.status === 'submitted') return 'En attente';
    if (ca.status === 'rejected')  return ca.rejection_reason || 'Non validé';
    return "C'est à toi !";
  };

  const myStatusColor = (status?: string) => {
    if (status === 'validated') return 'var(--dc-green)';
    if (status === 'submitted') return 'var(--dc-gold)';
    if (status === 'rejected')  return 'var(--dc-danger)';
    return 'var(--dc-text-light)';
  };

  return (
    <IonPage>
      {submitTarget && (
        <SubmitModal ca={submitTarget} childId={selectedChild.id}
          onClose={() => setSubmitTarget(null)}
          onSubmitted={() => { setSubmitTarget(null); loadMyActivities(); }}
        />
      )}

      <IonContent fullscreen scrollY>
        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)',
          padding: '52px 24px 20px', borderRadius: '0 0 28px 28px',
        }}>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 900, margin: '0 0 4px', letterSpacing: -0.3 }}>Activités</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '0 0 16px', fontWeight: 600 }}>Choisis ton prochain défi !</p>

          {/* Search (only in catalog) */}
          {tab === 'catalog' && (
            <div style={{ position: 'relative' }}>
              <Search size={15} color="rgba(255,255,255,0.6)" strokeWidth={2}
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px 11px 38px', borderRadius: 14,
                  border: 'none', background: 'rgba(255,255,255,0.15)',
                  color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          )}
        </div>

        <div style={{ padding: '16px 20px 100px' }}>
          {/* ── Tab toggle ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['catalog', 'mine'] as const).map(t => {
              const isActive = tab === t;
              return (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, height: 42, borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: `2px solid ${isActive ? 'var(--dc-blue)' : 'var(--dc-border)'}`,
                  background: isActive ? 'var(--dc-blue)' : 'white',
                  color: isActive ? 'white' : 'var(--dc-text-light)',
                  cursor: 'pointer', transition: 'all 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {t === 'catalog' ? 'Catalogue' : `Mes défis (${myActivities.length})`}
                </button>
              );
            })}
          </div>

          {tab === 'catalog' ? (<>
            {/* ── Category filters ── */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, scrollbarWidth: 'none' }}>
              <button onClick={() => setActiveCategory(null)} style={{
                flexShrink: 0, padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 700,
                border: 'none', cursor: 'pointer',
                background: !activeCategory ? 'var(--dc-blue)' : 'white',
                color: !activeCategory ? 'white' : 'var(--dc-text-light)',
                boxShadow: !activeCategory ? '0 3px 12px rgba(21,101,192,0.3)' : 'var(--dc-shadow)',
              }}>Tout</button>
              {categories.map(c => {
                const { accent } = getCategoryStyle(c.slug);
                const isActive = activeCategory === c.id;
                return (
                  <button key={c.id} onClick={() => setActiveCategory(isActive ? null : c.id)} style={{
                    flexShrink: 0, padding: '8px 14px', borderRadius: 50, fontSize: 13, fontWeight: 700,
                    border: 'none', cursor: 'pointer',
                    background: isActive ? accent : 'white',
                    color: isActive ? 'white' : 'var(--dc-text)',
                    boxShadow: isActive ? `0 3px 12px ${accent}44` : 'var(--dc-shadow)',
                  }}>{c.name}</button>
                );
              })}
            </div>

            {/* ── Activity list ── */}
            {filtered.length === 0 ? (
              <div className="dc-empty-state">
                <h3>Aucune activité trouvée</h3>
                <p>{search ? `Aucun résultat pour "${search}"` : 'Essaie une autre catégorie !'}</p>
              </div>
            ) : filtered.map(a => {
              const { bg, accent, Icon } = getCategoryStyle(a.category?.slug);
              return (
                <div key={a.id} className="dc-animate-in" style={{
                  display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
                  background: 'white', borderRadius: 16, padding: '12px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: '1.5px solid rgba(0,0,0,0.04)',
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={24} color={accent} strokeWidth={1.8} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dc-text)', marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PointsBadge points={a.points} size="sm" />
                      <DifficultyBadge difficulty={a.difficulty} />
                    </div>
                  </div>

                  {/* Select button */}
                  <button onClick={() => handleSelect(a)} style={{
                    background: accent, color: 'white', border: 'none',
                    borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s',
                  }}>
                    Choisir
                  </button>
                </div>
              );
            })}
          </>) : (<>
            {/* ── My activities list ── */}
            {myActivities.length === 0 ? (
              <div className="dc-empty-state">
                <h3>Aucun défi en cours</h3>
                <p>Va dans le catalogue et choisis ton premier défi !</p>
                <button className="dc-btn dc-btn-primary" style={{ marginTop: 12 }} onClick={() => setTab('catalog')}>
                  Voir le catalogue
                </button>
              </div>
            ) : myActivities.map(ca => {
              const { bg, accent, Icon } = getCategoryStyle(ca.activity?.category?.slug);
              return (
                <div key={ca.id} className="dc-animate-in" style={{
                  display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
                  background: 'white', borderRadius: 16, padding: '12px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: '1.5px solid rgba(0,0,0,0.04)',
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                    background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={24} color={accent} strokeWidth={1.8} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ca.activity?.title || ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <PointsBadge points={ca.activity?.points || 0} size="sm" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: myStatusColor(ca.status) }}>
                        {myStatusLabel(ca)}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  {ca.status === 'selected' && (
                    <button onClick={() => setSubmitTarget(ca)} style={{
                      background: 'var(--dc-green)', color: 'white', border: 'none',
                      borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}>
                      C'est fait !
                    </button>
                  )}
                  {ca.status === 'submitted' && (
                    <ChevronRight size={16} color="var(--dc-text-muted)" strokeWidth={2} />
                  )}
                </div>
              );
            })}
          </>)}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildActivitiesPage;
