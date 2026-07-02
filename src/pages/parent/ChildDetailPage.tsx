import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { childrenService } from '../../features/children/children.service';
import { activitiesService } from '../../features/activities/activities.service';
import { gamificationService } from '../../features/gamification/gamification.service';
import { supabase } from '../../lib/supabase';
import { Smartphone, QrCode, CheckCircle, RefreshCw, Clock, Trophy, ArrowLeft, CheckCircle2, BookPlus, Pencil, Trash2, X } from 'lucide-react';
import type { Child, ChildActivity, ChildBadge } from '../../types/database.types';

const ChildDetailPage: React.FC = () => {
  const { childId } = useParams<{ childId: string }>();
  const history = useHistory();
  const [child, setChild] = useState<Child | null>(null);
  const [activities, setActivities] = useState<ChildActivity[]>([]);
  const [badges, setBadges] = useState<ChildBadge[]>([]);
  const [weeklyStats, setWeeklyStats] = useState({ activitiesCompleted: 0, pointsEarned: 0, badgesEarned: 0 });
  const [allTimeStats, setAllTimeStats] = useState({ totalEarned: 0, totalSpent: 0, activitiesValidated: 0 });

  // QR Code state
  const [showQR, setShowQR] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrExpiry, setQrExpiry] = useState<Date | null>(null);

  // Edit child state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState<number>(10);
  const [editAvatar, setEditAvatar] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchAll = () => {
    if (!childId) return;
    setLoading(true);
    setLoadError(false);
    const timer = setTimeout(() => { setLoading(false); setLoadError(true); }, 8000);

    Promise.all([
      childrenService.getChild(childId),
      activitiesService.getChildActivities(childId),
      gamificationService.getChildBadges(childId),
      gamificationService.getWeeklyStats(childId),
      gamificationService.getAllTimeStats(childId),
    ])
      .then(([c, acts, bdgs, stats, allTime]) => {
        setChild(c);
        setEditName(c.display_name);
        setEditAge(c.age);
        setEditAvatar(c.avatar_url || '');
        setActivities(acts);
        setBadges(bdgs);
        setWeeklyStats(stats);
        setAllTimeStats(allTime);
      })
      .catch(err => { console.error('[ChildDetail] fetch error:', err); setLoadError(true); })
      .finally(() => { clearTimeout(timer); setLoading(false); });
  };

  // useEffect for param changes (navigating between child profiles)
  // useIonViewWillEnter for returning to the page from deeper navigation
  useEffect(fetchAll, [childId]);
  useIonViewWillEnter(fetchAll);

  const generateQR = async () => {
    if (!childId) return;
    setQrLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_child_link_token', { p_child_id: childId });
      if (error) throw error;
      setQrToken(data);
      setQrExpiry(new Date(Date.now() + 15 * 60 * 1000));
      setShowQR(true);
    } catch (e) {
      console.error('QR generation error:', e);
    } finally {
      setQrLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!child || !editName.trim()) return;
    setEditSaving(true);
    try {
      const updated = await childrenService.updateChild(child.id, {
        display_name: editName.trim(),
        age: editAge,
        avatar_url: editAvatar || null,
      });
      setChild(updated);
      setShowEdit(false);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!child) return;
    await childrenService.deactivateChild(child.id);
    history.replace('/parent/children');
  };

  if (loading || !child) return (
    <IonPage><IonContent>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--dc-text-light)' }}>
        {loadError
          ? <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Impossible de charger le profil</div>
              <button className="dc-btn dc-btn-primary" onClick={fetchAll}>Réessayer</button>
            </>
          : 'Chargement...'}
      </div>
    </IonContent></IonPage>
  );

  const progress = gamificationService.getLevelProgress(child.total_points);
  const isLinked = !!(child as any).pin_hash;

  const COLOR_OPTIONS = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#FDCB6E', '#A29BFE', '#FD79A8', '#2D3436'];

  return (
    <IonPage>
      {/* ── Edit Modal ── */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowEdit(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '28px 24px 40px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Modifier {child?.display_name}</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} color="var(--dc-text-muted)" /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Prénom</label>
              <input className="dc-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Prénom de l'enfant" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>Âge</label>
              <input className="dc-input" type="number" min={4} max={18} value={editAge} onChange={e => setEditAge(Number(e.target.value))} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 10 }}>Couleur de l'avatar</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setEditAvatar(c)} style={{
                    width: 36, height: 36, borderRadius: '50%', background: c, border: editAvatar === c ? '3px solid #2D3436' : '3px solid transparent', cursor: 'pointer',
                  }} />
                ))}
              </div>
            </div>
            <button className="dc-btn dc-btn-primary dc-btn-full" disabled={editSaving || !editName.trim()} onClick={handleSaveEdit}>
              {editSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setShowDeleteConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 24, padding: 28, width: '100%', maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 900 }}>Supprimer {child?.display_name} ?</h3>
            <p style={{ color: 'var(--dc-text-light)', fontSize: 14, marginBottom: 24 }}>Cette action est irréversible. Toutes les activités et données associées seront archivées.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="dc-btn dc-btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
              <button className="dc-btn" style={{ flex: 1, background: '#EF4444', color: 'white' }} onClick={handleDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
      {/* QR Modal */}
      {showQR && qrToken && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }} onClick={() => setShowQR(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 28, padding: '32px 28px',
            width: '90%', maxWidth: 380, textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Smartphone size={30} color="var(--dc-blue)" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>
              Lier l'appareil de {child.display_name}
            </h2>
            <p style={{ color: 'var(--dc-text-light)', fontSize: 13, marginBottom: 24 }}>
              Demandez à votre enfant de scanner ce QR code avec l'app Deconnect
            </p>

            {/* QR Code */}
            <div style={{
              background: 'white', padding: 20, borderRadius: 20,
              display: 'inline-block', border: '3px solid var(--dc-primary)',
              boxShadow: '0 4px 20px rgba(108,92,231,0.15)',
            }}>
              <QRCodeSVG
                value={JSON.stringify({
                  type: 'deconnect_link',
                  token: qrToken,
                  child: child.display_name,
                })}
                size={200}
                level="M"
                fgColor="#2D3436"
                bgColor="white"
                imageSettings={{
                  src: '',
                  height: 0,
                  width: 0,
                  excavate: false,
                }}
              />
            </div>

            {/* Timer */}
            <div style={{ marginTop: 16, padding: '8px 16px', borderRadius: 50, background: 'rgba(21,101,192,0.1)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--dc-blue)' }}>
              <Clock size={13} strokeWidth={2} /> Expire dans 15 minutes
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                className="dc-btn dc-btn-outline dc-btn-full"
                onClick={() => setShowQR(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', padding: '0 0 100px' }}>
          {/* Header gradient */}
          <div style={{
            background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
            padding: '60px 24px 32px', color: 'white',
          }}>
            <button onClick={() => history.goBack()} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12,
              padding: '8px 16px', color: 'white', fontSize: 14, cursor: 'pointer', marginBottom: 16,
            }}>← Retour</button>

            {/* Profile */}
            <div style={{ textAlign: 'center' }}>
              {child.avatar_url?.startsWith('/images/avatars/') ? (
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#EDE7FF', display: 'inline-block', marginBottom: 12, border: '3px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                  <img src={child.avatar_url} alt={child.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: child.avatar_url || 'var(--dc-blue)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 30, fontWeight: 900, color: 'white', border: '3px solid rgba(255,255,255,0.3)' }}>
                  {child.display_name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <h2 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 900 }}>{child.display_name}</h2>
              <p style={{ opacity: 0.85, margin: '0 0 16px', fontSize: 14 }}>
                {child.age} ans • Niveau {child.level}
              </p>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Niv. {child.level}</span>
                <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'white', borderRadius: 8, transition: 'width 0.6s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{child.total_points} pts</span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                <button
                  onClick={() => history.push(`/parent/children/${childId}/assign`)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '9px 14px', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <BookPlus size={15} strokeWidth={2} /> Assigner activités
                </button>
                <button
                  onClick={() => setShowEdit(true)}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '9px 14px', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Pencil size={15} strokeWidth={2} /> Modifier
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{ background: 'rgba(239,68,68,0.25)', border: 'none', borderRadius: 12, padding: '9px 14px', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 20px 0' }}>
            {/* QR Link button */}
            <div className="dc-card" style={{
              marginBottom: 20, padding: 20, textAlign: 'center',
              background: isLinked
                ? 'linear-gradient(135deg, rgba(0,184,148,0.08), rgba(0,184,148,0.02))'
                : 'linear-gradient(135deg, rgba(108,92,231,0.08), rgba(108,92,231,0.02))',
              border: isLinked ? '2px solid rgba(0,184,148,0.2)' : '2px dashed rgba(108,92,231,0.3)',
            }}>
              {isLinked ? (
                <>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--dc-green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                    <CheckCircle size={22} color="var(--dc-green)" strokeWidth={1.8} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--dc-green-dark)' }}>Appareil lié</div>
                  <p style={{ fontSize: 13, color: 'var(--dc-text-light)', margin: '4px 0 12px' }}>
                    {child.display_name} peut accéder à son espace depuis son appareil
                  </p>
                  <button
                    className="dc-btn"
                    style={{ padding: '8px 20px', fontSize: 13, background: 'var(--dc-primary)', color: 'white', borderRadius: 50 }}
                    onClick={generateQR}
                    disabled={qrLoading}
                  >
                    <RefreshCw size={14} strokeWidth={2} /> {qrLoading ? 'Génération...' : 'Nouveau QR code'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                    <Smartphone size={24} color="var(--dc-blue)" strokeWidth={1.5} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>Lier l'appareil de {child.display_name}</div>
                  <p style={{ fontSize: 13, color: 'var(--dc-text-light)', margin: '0 0 16px' }}>
                    Générez un QR code pour que votre enfant puisse accéder à son espace depuis son propre téléphone
                  </p>
                  <button
                    className="dc-btn dc-btn-primary"
                    style={{ padding: '12px 28px', fontSize: 15, borderRadius: 50 }}
                    onClick={generateQR}
                    disabled={qrLoading}
                  >
                    <QrCode size={16} strokeWidth={2} /> {qrLoading ? 'Génération...' : 'Générer le QR code'}
                  </button>
                </>
              )}
            </div>

            {/* All-time Stats */}
            <h3 className="dc-section-title">Total all-time</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div className="dc-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(0,184,148,0.08), rgba(0,184,148,0.02))', border: '1.5px solid rgba(0,184,148,0.15)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-success)' }}>+{allTimeStats.totalEarned}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Points gagnés</div>
              </div>
              <div className="dc-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))', border: '1.5px solid rgba(239,68,68,0.12)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-danger)' }}>-{allTimeStats.totalSpent}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Points utilisés</div>
              </div>
              <div className="dc-card" style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(108,92,231,0.08), rgba(108,92,231,0.02))', border: '1.5px solid rgba(108,92,231,0.12)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-primary)' }}>{allTimeStats.activitiesValidated}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Validées</div>
              </div>
            </div>

            {/* Weekly Stats */}
            <h3 className="dc-section-title">Cette semaine</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <div className="dc-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-success)' }}>{weeklyStats.activitiesCompleted}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Activités</div>
              </div>
              <div className="dc-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-primary)' }}>+{weeklyStats.pointsEarned}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Points</div>
              </div>
              <div className="dc-card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--dc-accent)' }}>{weeklyStats.badgesEarned}</div>
                <div style={{ fontSize: 11, color: 'var(--dc-text-light)' }}>Badges</div>
              </div>
            </div>

            {/* Badges */}
            {badges.length > 0 && (<>
              <h3 className="dc-section-title">Badges ({badges.length})</h3>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 24 }}>
                {badges.map(cb => (
                  <div key={cb.id} className="dc-card" style={{ minWidth: 90, textAlign: 'center', padding: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--dc-gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px' }}>
                    <Trophy size={18} color="var(--dc-gold-dark)" strokeWidth={1.8} />
                  </div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>{cb.badge?.name}</div>
                  </div>
                ))}
              </div>
            </>)}

            {/* Recent activities */}
            <h3 className="dc-section-title">Activités récentes</h3>
            {activities.length === 0 ? (
              <div className="dc-card" style={{ textAlign: 'center', padding: 24, color: 'var(--dc-text-light)' }}>
                Aucune activité pour le moment
              </div>
            ) : activities.slice(0, 5).map(ca => (
              <div key={ca.id} className="dc-card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: ca.status === 'validated' ? 'var(--dc-success)' : ca.status === 'submitted' ? 'var(--dc-warning)' : 'var(--dc-border)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ca.activity?.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--dc-text-light)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {ca.status === 'validated' ? (
                      <>
                        <CheckCircle size={12} color="var(--dc-success)" />
                        +{ca.earned_points} pts
                      </>
                    ) : ca.status === 'submitted' ? (
                      <>
                        <Clock size={12} />
                        En attente
                      </>
                    ) : ca.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChildDetailPage;
