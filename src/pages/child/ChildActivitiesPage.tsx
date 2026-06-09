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
import { Search, ChevronDown, ChevronUp, CheckCircle, Clock, XCircle } from 'lucide-react';

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

  const { accent, imgSrc } = getCategoryStyle(ca.activity?.category?.slug);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '28px 28px 0 0', padding: '24px 24px 40px', width: '100%', maxWidth: 600, animation: 'dc-slide-up 0.35s ease' }}>
        <div style={{ width: 40, height: 4, background: 'var(--dc-border)', borderRadius: 4, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={imgSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
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
  const [activities, setActivities]         = useState<Activity[]>([]);
  const [myActivities, setMyActivities]     = useState<ChildActivity[]>([]);
  const [categories, setCategories]         = useState<ActivityCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [tab, setTab]                       = useState<'catalog' | 'mine'>('mine');
  const [submitTarget, setSubmitTarget]     = useState<ChildActivity | null>(null);
  const [search, setSearch]                 = useState('');
  const [showHistory, setShowHistory]       = useState(false);

  const loadMyActivities = () => {
    if (selectedChild) activitiesService.getChildActivities(selectedChild.id).then(setMyActivities).catch(() => {});
  };

  useEffect(() => {
    activitiesService.getCategories().then(setCategories).catch(() => {});
    activitiesService.getActivities().then(setActivities).catch(() => {});
    loadMyActivities();
  }, [selectedChild?.id]);

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

  // Séparer : en cours vs terminées
  const activeList = myActivities.filter(ca => ca.status === 'selected' || ca.status === 'submitted');
  const doneList   = myActivities.filter(ca => ca.status === 'validated' || ca.status === 'rejected');

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
        <div className="dc-page-header">
          <div className="dc-header-row">
            <img src="/images/menu/account-activity.png" alt="activités" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            <h1>Activités</h1>
          </div>
          <p>
            {tab === 'mine'
              ? `${activeList.length} défi${activeList.length !== 1 ? 's' : ''} en cours`
              : 'Choisis ton prochain défi !'}
          </p>
        </div>

        <div style={{ padding: '16px 20px 100px' }}>
          {/* ── Tabs ── */}
          <div className="dc-tab-selector">
            {(['mine', 'catalog'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>
                {t === 'mine' ? (
                  <>
                    Mes défis
                    {activeList.length > 0 && (
                      <span style={{ background: tab === t ? 'rgba(108,92,231,0.15)' : 'rgba(0,0,0,0.06)', borderRadius: 50, padding: '1px 7px', fontSize: 12, marginLeft: 4 }}>
                        {activeList.length}
                      </span>
                    )}
                  </>
                ) : 'Catalogue'}
              </button>
            ))}
          </div>

          {/* Search (catalog only) */}
          {tab === 'catalog' && (
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search size={15} color="var(--dc-text-muted)" strokeWidth={2}
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text" placeholder="Rechercher..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '11px 14px 11px 38px', borderRadius: 12, border: '1.5px solid var(--dc-border)', background: 'white', color: 'var(--dc-text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* ══════════════ CATALOGUE ══════════════ */}
          {tab === 'catalog' && (<>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, scrollbarWidth: 'none' }}>
              <button onClick={() => setActiveCategory(null)} style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 50, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: !activeCategory ? 'var(--dc-blue)' : 'white', color: !activeCategory ? 'white' : 'var(--dc-text-light)', boxShadow: !activeCategory ? '0 3px 12px rgba(21,101,192,0.3)' : 'var(--dc-shadow)' }}>Tout</button>
              {categories.map(c => {
                const { accent } = getCategoryStyle(c.slug);
                const isActive = activeCategory === c.id;
                return (
                  <button key={c.id} onClick={() => setActiveCategory(isActive ? null : c.id)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 50, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: isActive ? accent : 'white', color: isActive ? 'white' : 'var(--dc-text)', boxShadow: isActive ? `0 3px 12px ${accent}44` : 'var(--dc-shadow)' }}>{c.name}</button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <div className="dc-empty-state">
                <h3>Aucune activité trouvée</h3>
                <p>{search ? `Aucun résultat pour "${search}"` : 'Essaie une autre catégorie !'}</p>
              </div>
            ) : filtered.map(a => {
              const { bg, accent, imgSrc } = getCategoryStyle(a.category?.slug);
              return (
                <div key={a.id} className="dc-animate-in" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, background: 'white', borderRadius: 16, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1.5px solid rgba(0,0,0,0.04)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={imgSrc} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--dc-text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PointsBadge points={a.points} size="sm" />
                      <DifficultyBadge difficulty={a.difficulty} />
                    </div>
                  </div>
                  <button onClick={() => handleSelect(a)} style={{ background: accent, color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    Choisir
                  </button>
                </div>
              );
            })}
          </>)}

          {/* ══════════════ MES DÉFIS ══════════════ */}
          {tab === 'mine' && (<>

            {/* En cours */}
            {activeList.length === 0 ? (
              <div className="dc-empty-state">
                <h3>Aucun défi en cours</h3>
                <p>Va dans le catalogue et choisis ton premier défi !</p>
                <button className="dc-btn dc-btn-primary" style={{ marginTop: 12 }} onClick={() => setTab('catalog')}>
                  Voir le catalogue
                </button>
              </div>
            ) : activeList.map(ca => {
              const { bg, imgSrc } = getCategoryStyle(ca.activity?.category?.slug);
              const isSubmitted = ca.status === 'submitted';
              return (
                <div key={ca.id} className="dc-animate-in" style={{
                  display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
                  background: 'white', borderRadius: 16, padding: '12px 14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  border: isSubmitted ? '1.5px solid var(--dc-gold)' : '1.5px solid rgba(0,0,0,0.04)',
                }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: isSubmitted ? 'rgba(253,196,0,0.12)' : bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSubmitted
                      ? <Clock size={24} color="var(--dc-gold)" strokeWidth={1.8} />
                      : <img src={imgSrc} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ca.activity?.title || ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <PointsBadge points={ca.activity?.points || 0} size="sm" />
                      {isSubmitted && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-gold)' }}>En attente de validation</span>}
                    </div>
                  </div>
                  {ca.status === 'selected' && (
                    <button onClick={() => setSubmitTarget(ca)} style={{ background: 'var(--dc-green)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                      C'est fait !
                    </button>
                  )}
                </div>
              );
            })}

            {/* ── Terminées (repliées par défaut) ── */}
            {doneList.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <button
                  onClick={() => setShowHistory(h => !h)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 4px', marginBottom: 6 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dc-text-muted)', letterSpacing: '0.08em' }}>
                    TERMINÉES ({doneList.length})
                  </span>
                  {showHistory
                    ? <ChevronUp size={16} color="var(--dc-text-muted)" strokeWidth={2} />
                    : <ChevronDown size={16} color="var(--dc-text-muted)" strokeWidth={2} />
                  }
                </button>

                {showHistory && doneList.map(ca => {
                  const { bg, imgSrc } = getCategoryStyle(ca.activity?.category?.slug);
                  const isValidated = ca.status === 'validated';
                  return (
                    <div key={ca.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                      background: 'white', borderRadius: 14, padding: '10px 14px', opacity: 0.72,
                      border: isValidated ? '1.5px solid rgba(0,184,148,0.25)' : '1.5px solid rgba(255,107,107,0.2)',
                    }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={imgSrc} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ca.activity?.title || ''}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isValidated
                            ? <><CheckCircle size={12} color="var(--dc-green)" strokeWidth={2.5} /><span style={{ color: 'var(--dc-green)', fontWeight: 700 }}>+{ca.earned_points} pts gagnés</span></>
                            : <><XCircle size={12} color="var(--dc-danger)" strokeWidth={2.5} /><span style={{ color: 'var(--dc-danger)', fontWeight: 600 }}>{ca.rejection_reason || 'Non validé'}</span></>
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildActivitiesPage;
