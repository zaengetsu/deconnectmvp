import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAppStore } from '../../stores/app.store';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import { storageService, type UploadedProof } from '../../features/storage/storage.service';
import { emailService } from '../../features/notifications/email.service';
import ProofUpload from '../../components/ui/ProofUpload';
import { getCategoryStyle } from '../../lib/categoryStyle';
import { RkSheet } from '../../components/rk/RkShell';
import RkSearch from '../../components/rk/RkSearch';
import { useSwipe, stepSection } from '../../hooks/useSwipe';
import { matches } from '../../lib/search';
import type { Activity, ActivityCategory, ChildActivity } from '../../types/database.types';

/** Mes défis — porté de la maquette Rekonect (écran cActs). */

const ChildActivitiesPage: React.FC = () => {
  const { selectedChild, refreshSelectedChild } = useAppStore();
  const { profile } = useAuthStore();

  const [tab, setTab] = useState<'mine' | 'catalog'>('mine');
  const SECTIONS = ['mine', 'catalog'] as const;
  const swipe = useSwipe({
    onLeft:  () => stepSection(SECTIONS, tab, 1, setTab),
    onRight: () => stepSection(SECTIONS, tab, -1, setTab),
  });
  const [mine, setMine] = useState<ChildActivity[]>([]);
  const [catalog, setCatalog] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [cat, setCat] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [taking, setTaking] = useState<string | null>(null);

  // Feuille d'envoi (note + preuve)
  const [submitTarget, setSubmitTarget] = useState<ChildActivity | null>(null);
  const [note, setNote] = useState('');
  const [proof, setProof] = useState<UploadedProof | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!selectedChild) return;
    activitiesService.getChildActivities(selectedChild.id).then(setMine).catch(() => {});
    activitiesService.getCategories().then(setCategories).catch(() => {});
    activitiesService.getActivities({ min_age: selectedChild.age, max_age: selectedChild.age })
      .then(setCatalog)
      .catch(() => activitiesService.getActivities().then(setCatalog).catch(() => {}));
  };

  useEffect(load, [selectedChild?.id]);
  useIonViewWillEnter(load);

  if (!selectedChild) return null;

  const assigned = mine.filter(ca => ca.status === 'available');
  const chosen   = mine.filter(ca => ca.status === 'selected' || ca.status === 'submitted');
  const finished = mine.filter(ca => ca.status === 'validated' || ca.status === 'rejected').slice(0, 3);
  const inProgress = assigned.length + chosen.length;
  const doneCount = mine.filter(ca => ca.status === 'validated').length;

  // Seules les activités EN COURS sortent du catalogue : une activité déjà
  // réalisée (ou refusée) peut être refaite autant de fois qu'on veut.
  const takenIds = new Set(
    mine.filter(ca => ca.status === 'available' || ca.status === 'selected' || ca.status === 'submitted')
        .map(ca => ca.activity_id),
  );
  const visibleCatalog = catalog
    .filter(a => !takenIds.has(a.id))
    .filter(a => cat === 'all' || a.category_id === cat)
    .filter(a => matches(query, a.title, a.description, a.category?.name))
    .slice(0, query ? 50 : 12);

  const take = async (activity: Activity) => {
    setTaking(activity.id);
    try {
      await activitiesService.selectActivity(selectedChild.id, activity.id);
      load();
      setTab('mine');
    } catch (e) { console.error('[cActs] select:', e); }
    finally { setTaking(null); }
  };

  const start = async (ca: ChildActivity) => {
    try { await activitiesService.startAssignedActivity(ca.id); load(); }
    catch (e) { console.error('[cActs] start:', e); }
  };

  const submit = async () => {
    if (!submitTarget) return;
    setSubmitting(true);
    try {
      await activitiesService.submitActivity(submitTarget.id, note || undefined, proof?.url, proof?.type);
      if (profile?.email && profile?.full_name) {
        emailService.sendActivitySubmitted(
          profile.email, profile.full_name, selectedChild.display_name,
          submitTarget.activity?.title || 'une activité',
        );
      }
      setSubmitTarget(null); setNote(''); setProof(null);
      await refreshSelectedChild();
      load();
    } catch (e) { console.error('[cActs] submit:', e); }
    finally { setSubmitting(false); }
  };

  const eyebrow = (color = 'var(--rk-text3)'): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color, marginBottom: 11,
  });

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }} {...swipe}>

        {/* ── En-tête + bascule ───────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 18px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Mes défis
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 14px' }}>
            {inProgress} en cours · {doneCount} terminé{doneCount > 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', gap: 5, background: 'var(--rk-surface2)', padding: 4, borderRadius: 13 }}>
            {(['mine', 'catalog'] as const).map(k => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 700, textAlign: 'center',
                background: tab === k ? 'var(--rk-surface)' : 'transparent',
                color: tab === k ? 'var(--rk-text)' : 'var(--rk-text3)',
              }}>
                {k === 'mine' ? 'En cours' : 'En choisir un'}
              </button>
            ))}
          </div>
        </div>

        {/* ── En cours ────────────────────────────────────────── */}
        {tab === 'mine' && (
          <div style={{ padding: '18px 22px 140px' }}>
            {assigned.length > 0 && (
              <>
                <div style={eyebrow('var(--rk-indigo)')}>ASSIGNÉS PAR TES PARENTS · {assigned.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {assigned.map(ca => {
                    const st = getCategoryStyle(ca.activity?.category?.slug);
                    return (
                      <div key={ca.id} style={{
                        display: 'flex', alignItems: 'center', gap: 13, background: 'var(--rk-indigosoft)',
                        border: '1.5px solid var(--rk-indigo)', borderRadius: 18, padding: 13,
                      }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 14, background: 'var(--rk-surface)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <img src={st.imgSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{ca.activity?.title}</div>
                          <div style={{ fontSize: 12, color: 'var(--rk-text2)', marginTop: 2 }}>
                            {ca.activity?.points ?? 0} points
                          </div>
                        </div>
                        <button onClick={() => start(ca)} style={{
                          height: 36, padding: '0 15px', borderRadius: 999, background: 'var(--rk-indigo)',
                          color: 'var(--rk-indigofg)', fontSize: 13, fontWeight: 700, flexShrink: 0,
                          display: 'flex', alignItems: 'center',
                        }}>Commencer</button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {chosen.length > 0 && (
              <>
                <div style={eyebrow()}>TU LES AS CHOISIS · {chosen.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {chosen.map(ca => {
                    const st = getCategoryStyle(ca.activity?.category?.slug);
                    const waiting = ca.status === 'submitted';
                    return (
                      <div key={ca.id} style={{
                        display: 'flex', alignItems: 'center', gap: 13, background: 'var(--rk-surface)',
                        border: waiting ? '1.5px solid var(--rk-amber)' : '1px solid var(--rk-border)',
                        borderRadius: 18, padding: 13,
                      }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 14,
                          background: waiting ? 'var(--rk-ambersoft)' : 'var(--rk-sagesoft)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {waiting
                            ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid var(--rk-amber)' }} />
                            : <img src={st.imgSrc} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{ca.activity?.title}</div>
                          <div style={{
                            fontSize: 12, marginTop: 2,
                            color: waiting ? 'var(--rk-amber)' : 'var(--rk-text3)',
                            fontWeight: waiting ? 700 : 400,
                          }}>
                            {waiting ? 'Ton parent regarde ta demande' : `${ca.activity?.points ?? 0} points`}
                          </div>
                        </div>
                        {!waiting && (
                          <button onClick={() => { setSubmitTarget(ca); setNote(''); setProof(null); }} style={{
                            height: 36, padding: '0 15px', borderRadius: 999, background: 'var(--rk-accent)',
                            color: 'var(--rk-accentink)', fontSize: 13, fontWeight: 800, flexShrink: 0,
                            display: 'flex', alignItems: 'center',
                          }}>C'est fait</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {finished.length > 0 && (
              <>
                <div style={eyebrow()}>TERMINÉS · {finished.length} DERNIERS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {finished.map(ca => {
                    const ok = ca.status === 'validated';
                    return (
                      <div key={ca.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12, background: 'var(--rk-surface)',
                        border: '1px solid var(--rk-border)', borderRadius: 16, padding: '11px 13px', opacity: .75,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                          background: ok ? 'var(--rk-sagesoft)' : 'var(--rk-raspsoft)',
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text)' }}>{ca.activity?.title}</div>
                          <div style={{
                            fontSize: 11, marginTop: 2,
                            fontWeight: ok ? 700 : 600,
                            color: ok ? 'var(--rk-sage)' : 'var(--rk-rasp)',
                          }}>
                            {ok
                              ? `+${ca.earned_points ?? ca.activity?.points ?? 0} points gagnés`
                              : `Pas validé${ca.rejection_reason ? ` : « ${ca.rejection_reason} »` : ''}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {inProgress === 0 && finished.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 12px' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', marginBottom: 6 }}>Aucun défi en cours</div>
                <div style={{ fontSize: 14, color: 'var(--rk-text3)', lineHeight: 1.5 }}>
                  Va en choisir un dans l'onglet « En choisir un ».
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Catalogue ───────────────────────────────────────── */}
        {tab === 'catalog' && (
          <div style={{ padding: '16px 0 140px' }}>
            <div style={{ padding: '0 22px 14px' }}>
              <RkSearch value={query} onChange={setQuery} placeholder="Chercher une activité" />
            </div>
            <div className="rk-sc" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 22px 16px' }}>
              {[{ id: 'all', name: 'Tout' }, ...categories].map(c => {
                const active = cat === c.id;
                return (
                  <button key={c.id} onClick={() => setCat(c.id)} style={{
                    height: 34, padding: '0 15px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
                    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center',
                    background: active ? 'var(--rk-accent)' : 'var(--rk-surface)',
                    border: active ? 'none' : '1px solid var(--rk-border)',
                    color: active ? 'var(--rk-accentink)' : 'var(--rk-text2)',
                  }}>{c.name}</button>
                );
              })}
            </div>

            <div style={{ padding: '0 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {visibleCatalog.map(a => {
                const st = getCategoryStyle(a.category?.slug);
                return (
                  <div key={a.id} style={{
                    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                    borderRadius: 20, padding: 14,
                  }}>
                    <div style={{
                      height: 70, borderRadius: 14, background: 'var(--rk-accentsoft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                    }}>
                      <img src={st.imgSrc} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text)', lineHeight: 1.3, minHeight: 34 }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--rk-text)', margin: '6px 0 10px' }}>
                      {a.points} points
                    </div>
                    <button onClick={() => take(a)} disabled={taking === a.id} style={{
                      width: '100%', height: 36, borderRadius: 999, background: 'var(--rk-accent)',
                      color: 'var(--rk-accentink)', fontSize: 13, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: taking === a.id ? .6 : 1,
                    }}>
                      {taking === a.id ? '…' : 'Je le prends'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Feuille « Bien joué ! » (maquette sh_submit) ─────── */}
        <RkSheet open={!!submitTarget} onClose={() => setSubmitTarget(null)}>
          {submitTarget && (() => {
            const st = getCategoryStyle(submitTarget.activity?.category?.slug);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, background: st.bg, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src={st.imgSrc} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--rk-text)' }}>
                      Bien joué !
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {submitTarget.activity?.title} · {submitTarget.activity?.points ?? 0} points
                    </div>
                  </div>
                </div>

                <ProofUpload
                  childId={selectedChild.id}
                  childActivityId={submitTarget.id}
                  onUploadComplete={setProof}
                  onRemove={async () => {
                    if (proof) { await storageService.deleteActivityProof(proof.path).catch(() => {}); setProof(null); }
                  }}
                  currentProof={proof}
                  hint="conseillé pour cette activité"
                />

                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Raconte comment ça s'est passé (optionnel)"
                  style={{
                    width: '100%', height: 78, borderRadius: 16, border: '1.5px solid var(--rk-border)',
                    background: 'var(--rk-surface)', padding: '13px 15px', fontSize: 14,
                    fontFamily: 'inherit', color: 'var(--rk-text)', lineHeight: 1.5, resize: 'none',
                    marginBottom: 16,
                  }}
                />

                <button onClick={submit} disabled={submitting} style={{
                  width: '100%', height: 52, borderRadius: 999, background: 'var(--rk-accent)',
                  color: 'var(--rk-accentink)', fontSize: 15, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: submitting ? .6 : 1,
                }}>
                  {submitting ? 'Envoi…' : 'Envoyer à mes parents'}
                </button>

                <button onClick={() => setSubmitTarget(null)} style={{
                  display: 'block', width: '100%', textAlign: 'center', padding: '16px 0 0',
                  fontSize: 14, fontWeight: 700, color: 'var(--rk-text3)',
                }}>
                  Annuler
                </button>
              </>
            );
          })()}
        </RkSheet>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildActivitiesPage;
