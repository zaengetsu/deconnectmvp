import React, { useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import { notificationService } from '../../features/notifications/notification.service';
import { ImageIcon } from 'lucide-react';
import type { ChildActivity } from '../../types/database.types';

const isHexColor = (v?: string | null) => !!v && /^#[0-9A-Fa-f]{3,8}$/.test(v);

const MiniAvatar = ({ avatarUrl, displayName }: { avatarUrl?: string | null; displayName?: string | null }) => {
  const isColor = isHexColor(avatarUrl);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: isColor ? avatarUrl! : 'var(--dc-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: isColor ? 15 : 16, fontWeight: 900, color: 'white',
      boxShadow: isColor ? `0 2px 8px ${avatarUrl}60` : undefined,
    }}>
      {isColor ? (displayName?.[0]?.toUpperCase() ?? '?') : (displayName?.[0]?.toUpperCase() ?? '?')}
    </div>
  );
};

const ValidationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [pending, setPending] = useState<ChildActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ChildActivity | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadPending = async (userId: string) => {
    setLoading(true);
    try {
      const data = await activitiesService.getPendingValidations(userId);
      setPending(data);
    } finally {
      setLoading(false);
    }
  };

  const fetchPending = () => {
    if (!user) { setLoading(false); return; }
    loadPending(user.id).catch(err => {
      console.error('[Validations] fetch error:', err);
      setLoading(false);
    });
  };

  // useIonViewWillEnter covers both initial mount AND subsequent returns
  useIonViewWillEnter(fetchPending);

  const handleValidate = async (ca: ChildActivity) => {
    if (!user) return;
    setProcessing(ca.id);
    await activitiesService.validateActivity(ca.id, user.id);

    // In-app notification for the child (no email — children don't have email accounts)
    if (ca.child?.id) {
      notificationService.createNotification(
        'child',
        ca.child.id,
        'Activité validée',
        `"${ca.activity?.title || 'ton activité'}" a été validée — +${ca.activity?.points || 0} points !`,
        'check',
        '/child/points',
        { type: 'activity_validated', activity_id: ca.id }
      ).catch(() => {});
    }

    setProcessing(null);
    loadPending(user.id);
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim() || !user) return;
    setProcessing(rejectTarget.id);
    await activitiesService.rejectActivity(rejectTarget.id, user.id, rejectReason);

    // In-app notification for the child
    if (rejectTarget.child?.id) {
      notificationService.createNotification(
        'child',
        rejectTarget.child.id,
        'Activité non validée',
        rejectReason || `"${rejectTarget.activity?.title}" n'a pas été validée cette fois.`,
        'info',
        '/child/activities',
        { type: 'activity_rejected', activity_id: rejectTarget.id }
      ).catch(() => {});
    }

    setProcessing(null);
    setRejectTarget(null);
    setRejectReason('');
    loadPending(user.id);
  };

  return (
    <IonPage>
      {/* Reject modal */}
      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
          onClick={() => { setRejectTarget(null); setRejectReason(''); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 24px 48px', width: '100%' }}>
            <div style={{ width: 40, height: 4, background: 'var(--dc-border)', borderRadius: 4, margin: '0 auto 20px' }} />
            <h3 style={{ margin: '0 0 6px', fontWeight: 700 }}>Motif du refus</h3>
            <p style={{ fontSize: 13, color: 'var(--dc-text-light)', marginBottom: 16 }}>{rejectTarget.activity?.title}</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Explique pourquoi l'activité n'est pas validée..."
              rows={3} maxLength={200}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '2px solid var(--dc-border)', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
            <button className="dc-btn dc-btn-full" disabled={!rejectReason.trim()}
              style={{ background: 'var(--dc-danger)', color: 'white', opacity: rejectReason.trim() ? 1 : 0.5 }}
              onClick={handleReject}>Confirmer le refus</button>
            <button className="dc-btn dc-btn-outline dc-btn-full" style={{ marginTop: 8 }}
              onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Annuler</button>
          </div>
        </div>
      )}

      <IonContent fullscreen>
        <div className="dc-page-header">
          <div className="dc-header-row">
            <img src="/images/menu/stamp.png" alt="validations" style={{ width: 26, height: 26, objectFit: 'contain' }} />
            <h1>Validations</h1>
          </div>
          <p>Activités en attente de votre validation</p>
        </div>

        <div style={{ padding: '20px 20px 100px' }}>

          {loading ? (
            <p style={{ textAlign: 'center', padding: 40, color: 'var(--dc-text-light)' }}>Chargement...</p>
          ) : pending.length === 0 ? (
            <div className="dc-empty-state">
              <h3>Tout est à jour</h3>
              <p>Aucune activité en attente</p>
            </div>
          ) : pending.map(ca => (
            <div key={ca.id} className="dc-card dc-animate-in" style={{ marginBottom: 16 }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <MiniAvatar avatarUrl={ca.child?.avatar_url} displayName={ca.child?.display_name} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{ca.activity?.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--dc-text-light)' }}>
                    {ca.child?.display_name} · {ca.activity?.points} pts
                  </div>
                </div>
              </div>

              {/* Child note */}
              {ca.child_note && (
                <div style={{
                  background: 'var(--dc-bg)', borderRadius: 10, padding: '10px 12px', marginBottom: 12,
                  fontSize: 13, color: 'var(--dc-text-light)', fontStyle: 'italic',
                  borderLeft: '3px solid var(--dc-border)',
                }}>
                  "{ca.child_note}"
                </div>
              )}

              {/* Proof */}
              {(ca as any).proof_url && (
                <div style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--dc-border)' }}>
                  {(ca as any).proof_type === 'video' ? (
                    <video src={(ca as any).proof_url} controls style={{ width: '100%', maxHeight: 220, display: 'block' }} />
                  ) : (
                    <img src={(ca as any).proof_url} alt="Preuve" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ padding: '6px 12px', background: 'var(--dc-bg)', fontSize: 12, fontWeight: 600, color: 'var(--dc-text-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageIcon size={12} /> Preuve fournie
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dc-btn dc-btn-primary" style={{ flex: 1, padding: '10px 16px' }}
                  disabled={processing === ca.id} onClick={() => handleValidate(ca)}>
                  {processing === ca.id ? '...' : 'Valider'}
                </button>
                <button className="dc-btn dc-btn-outline" style={{ flex: 1, padding: '10px 16px', color: 'var(--dc-danger)', borderColor: 'var(--dc-danger)' }}
                  disabled={processing === ca.id} onClick={() => setRejectTarget(ca)}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ValidationsPage;
