import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { checkmarkDoneOutline } from 'ionicons/icons';
import RkEmpty from '../../components/rk/RkEmpty';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';
import { RkSheet } from '../../components/rk/RkShell';
import type { ChildActivity } from '../../types/database.types';

/** Validations — porté de la maquette Rekonect (écran pValid). */

const REJECT_PRESETS = ['Photo trop floue', 'Pas terminé', 'À refaire demain'];

const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = new Date(iso);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (h < 48) return `hier à ${time}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} à ${time}`;
};

const ValidationsPage: React.FC = () => {
  const { user } = useAuthStore();
  const history = useHistory();
  const [pending, setPending] = useState<ChildActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [justDone, setJustDone] = useState<{ id: string; title: string; child: string; points: number; ok: boolean }[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<ChildActivity | null>(null);
  const [reason, setReason] = useState('');

  const load = () => {
    if (!user) return;
    activitiesService.getPendingValidations(user.id)
      .then(list => { setPending(list); setLoadError(false); })
      .catch(e => { console.error('[pValid]', e); setLoadError(true); })
      .finally(() => setLoaded(true));
  };

  useEffect(load, [user?.id]);
  useIonViewWillEnter(load);

  const validate = async (ca: ChildActivity) => {
    if (!user) return;
    setProcessing(ca.id);
    try {
      await activitiesService.validateActivity(ca.id, user.id);
      setJustDone(prev => [{
        id: ca.id,
        title: ca.activity?.title ?? 'Activité',
        child: ca.child?.display_name ?? 'Votre enfant',
        points: ca.activity?.points ?? 0,
        ok: true,
      }, ...prev]);
      setPending(prev => prev.filter(x => x.id !== ca.id));
    } catch (e) { console.error('[pValid] validate:', e); }
    finally { setProcessing(null); }
  };

  const reject = async () => {
    if (!rejectTarget || !user || !reason.trim()) return;
    setProcessing(rejectTarget.id);
    try {
      await activitiesService.rejectActivity(rejectTarget.id, user.id, reason.trim());
      setJustDone(prev => [{
        id: rejectTarget.id,
        title: rejectTarget.activity?.title ?? 'Activité',
        child: rejectTarget.child?.display_name ?? 'Votre enfant',
        points: 0,
        ok: false,
      }, ...prev]);
      setPending(prev => prev.filter(x => x.id !== rejectTarget.id));
      setRejectTarget(null);
      setReason('');
    } catch (e) { console.error('[pValid] reject:', e); }
    finally { setProcessing(null); }
  };

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Validations
          </h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
            Vérifiez, puis attribuez les points
          </p>
        </div>

        <div style={{ padding: '18px 22px 140px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {pending.map(ca => {
            const points = ca.activity?.points ?? 0;
            const isImg = ca.child?.avatar_url?.startsWith('/images/avatars/');
            return (
              <div key={ca.id} style={{
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                borderRadius: 22, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 14px' }}>
                  {isImg ? (
                    <img src={ca.child!.avatar_url!} alt="" style={{
                      width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#EDE7FF',
                    }} />
                  ) : (
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: '#EDE7FF',
                      color: 'var(--rk-indigo)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 16, fontWeight: 800,
                    }}>{ca.child?.display_name?.[0]?.toUpperCase() ?? '?'}</div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)', letterSpacing: '-.01em' }}>
                      {ca.activity?.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                      {ca.child?.display_name} · {timeAgo(ca.submitted_at)}
                    </div>
                  </div>

                  <div style={{
                    height: 28, padding: '0 11px', borderRadius: 999, background: 'var(--rk-accentsoft)',
                    color: 'var(--rk-text)', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', flexShrink: 0,
                  }}>{points} pts</div>
                </div>

                {ca.child_note && (
                  <div style={{
                    margin: '0 16px 12px', padding: '11px 13px', borderRadius: 14,
                    background: 'var(--rk-surface2)', fontSize: 13, color: 'var(--rk-text2)', lineHeight: 1.5,
                  }}>
                    « {ca.child_note} »
                  </div>
                )}

                {ca.proof_url && (
                  <div style={{ margin: '0 16px 14px' }}>
                    {ca.proof_type?.startsWith('video') ? (
                      <video src={ca.proof_url} controls style={{ width: '100%', borderRadius: 14, display: 'block' }} />
                    ) : (
                      <img src={ca.proof_url} alt="Preuve" style={{
                        width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 14, display: 'block',
                      }} />
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
                  <button
                    onClick={() => validate(ca)}
                    disabled={processing === ca.id}
                    style={{
                      flex: 1, height: 46, borderRadius: 999, background: 'var(--rk-indigo)',
                      color: 'var(--rk-indigofg)', fontSize: 14, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: processing === ca.id ? .6 : 1,
                    }}
                  >
                    {processing === ca.id ? '…' : `Valider · +${points} pts`}
                  </button>
                  <button
                    onClick={() => { setRejectTarget(ca); setReason(''); }}
                    style={{
                      width: 104, height: 46, borderRadius: 999, border: '1.5px solid var(--rk-border)',
                      color: 'var(--rk-text)', fontSize: 14, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            );
          })}

          {/* Traité à l'instant : confirmation douce, comme dans la maquette */}
          {justDone.map(d => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16,
              background: d.ok ? 'var(--rk-sagesoft)' : 'var(--rk-raspsoft)',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 11, flexShrink: 0,
                background: d.ok ? 'var(--rk-sage)' : 'var(--rk-rasp)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 12, height: 7, borderLeft: '2.5px solid #fff', borderBottom: '2.5px solid #fff',
                  transform: 'rotate(-45deg) translate(1px,-2px)',
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>
                  {d.title} · {d.ok ? 'validée' : 'refusée'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--rk-text2)', marginTop: 2 }}>
                  {d.ok
                    ? `${d.child} a reçu ${d.points} points et une notification`
                    : `${d.child} a reçu votre message`}
                </div>
              </div>
            </div>
          ))}

          {pending.length > 0 && (
            <p style={{
              fontSize: 12, color: 'var(--rk-text3)', textAlign: 'center',
              lineHeight: 1.55, margin: '8px 10px 0',
            }}>
              Les points sont crédités immédiatement. L'enfant reçoit une notification dans les deux cas.
            </p>
          )}

          {!loaded && pending.length === 0 && (
            <div style={{ textAlign: 'center', padding: '50px 16px', color: 'var(--rk-text3)', fontSize: 13 }}>
              Chargement…
            </div>
          )}

          {loaded && loadError && pending.length === 0 && (
            <RkEmpty
              icon={checkmarkDoneOutline}
              tint="var(--rk-ambersoft)"
              title="Impossible de charger les validations"
              text="Vérifiez votre connexion, puis réessayez."
              cta={{ label: 'Réessayer', onClick: load }}
            />
          )}

          {loaded && !loadError && pending.length === 0 && justDone.length === 0 && (
            <RkEmpty
              icon={checkmarkDoneOutline}
              title="Rien à valider pour l'instant"
              text="Ici apparaissent les activités que vos enfants déclarent terminées. Vous vérifiez (photo, note), puis vous validez : les points sont crédités et l'enfant est prévenu."
              steps={[
                'Vous assignez une activité, ou votre enfant en choisit une dans son catalogue.',
                'Il la réalise et appuie sur « C’est fait ! », avec une photo s’il veut.',
                'Elle arrive ici : vous validez ou vous demandez de refaire, en un geste.',
              ]}
              cta={{ label: 'Assigner une activité', onClick: () => history.push('/parent/children') }}
            />
          )}

          {loaded && !loadError && pending.length === 0 && justDone.length > 0 && (
            <div style={{ textAlign: 'center', padding: '24px 16px 0', color: 'var(--rk-text3)', fontSize: 13, lineHeight: 1.5 }}>
              Tout est traité. Vous serez prévenu à la prochaine activité terminée.
            </div>
          )}
        </div>

        {/* ── Feuille « Pourquoi refuser ? » ──────────────────── */}
        <RkSheet
          open={!!rejectTarget}
          onClose={() => setRejectTarget(null)}
          title="Pourquoi refuser ?"
          subtitle="Votre enfant lira ce message. Restez encourageant."
        >
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            {REJECT_PRESETS.map(p => (
              <button key={p} onClick={() => setReason(p)} style={{
                height: 34, padding: '0 13px', borderRadius: 999,
                background: reason === p ? 'var(--rk-indigosoft)' : 'var(--rk-surface2)',
                color: reason === p ? 'var(--rk-indigo)' : 'var(--rk-text2)',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center',
              }}>{p}</button>
            ))}
          </div>

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Explique en une phrase…"
            style={{
              width: '100%', height: 88, borderRadius: 16, border: '1.5px solid var(--rk-border)',
              background: 'var(--rk-surface)', padding: '13px 15px', fontSize: 14,
              fontFamily: 'inherit', color: 'var(--rk-text)', lineHeight: 1.5,
              marginBottom: 18, resize: 'none',
            }}
          />

          <button
            onClick={reject}
            disabled={!reason.trim() || !!processing}
            style={{
              width: '100%', height: 52, borderRadius: 999, background: 'var(--rk-raspsoft)',
              color: 'var(--rk-rasp)', fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: reason.trim() ? 1 : .5,
            }}
          >
            Envoyer et refuser
          </button>
        </RkSheet>
      </div>
    </IonContent></IonPage>
  );
};

export default ValidationsPage;
