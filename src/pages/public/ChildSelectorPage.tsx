import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useAppStore } from '../../stores/app.store';
import { childrenService } from '../../features/children/children.service';
import { childSession } from '../../features/auth/child.session';
import { gamificationService } from '../../features/gamification/gamification.service';
import type { Child } from '../../types/database.types';

/**
 * Qui joue ? — porté de la maquette Rekonect (écran selectchild).
 *
 * Le PIN reste obligatoire : l'enfant ouvre sa propre session, il n'hérite
 * jamais de celle du parent.
 */
const ChildSelectorPage: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const { selectChild } = useAppStore();

  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Child | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canList = !!user && !user.is_anonymous;

  useEffect(() => {
    if (!user || user.is_anonymous) return;
    let cancelled = false;
    childrenService.getChildren(user.id).then(c => {
      if (cancelled) return;
      setChildren(c);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [user]);

  const digit = (d: string) => {
    if (submitting || pin.length >= 4) return;
    setError(null);
    setPin(prev => prev + d);
  };

  const validate = async () => {
    if (!pending || pin.length < 4 || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await childSession.login(pending.id, pin);
    if (result.success && result.child) {
      // La session a changé (parent → enfant) hors du store : on l'aligne
      // avant d'entrer dans /child, sinon la garde de route renvoie au login.
      await useAuthStore.getState().syncSession();
      selectChild(result.child);
      history.replace('/child/home');
      return;
    }

    setPin('');
    setSubmitting(false);
    setError(
      result.locked_until
        ? result.error ?? 'Profil verrouillé quelques minutes.'
        : result.attempts_left !== undefined
          ? `${result.error} — ${result.attempts_left} essai(s) restant(s)`
          : result.error ?? 'PIN incorrect',
    );
  };

  // ── Écran PIN ─────────────────────────────────────────────
  if (pending) {
    const isImg = pending.avatar_url?.startsWith('/images/avatars/');
    return (
      <IonPage><IonContent fullscreen>
        <div className="rk-app rk-screen" style={{
          minHeight: '100%', background: 'var(--rk-bg)',
          padding: 'calc(env(safe-area-inset-top) + 32px) 26px 44px',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            {isImg ? (
              <img src={pending.avatar_url!} alt="" style={{
                width: 76, height: 76, borderRadius: '50%', objectFit: 'cover',
                marginBottom: 14, background: '#EDE7FF',
              }} />
            ) : (
              <div style={{
                width: 76, height: 76, borderRadius: '50%', margin: '0 auto 14px',
                background: 'var(--rk-accentsoft)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 30, fontWeight: 800, color: 'var(--rk-text)',
              }}>{pending.display_name[0]?.toUpperCase()}</div>
            )}
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
              Bonjour {pending.display_name}
            </h1>
            <p style={{ fontSize: 14, color: 'var(--rk-text3)', margin: '7px 0 0' }}>
              Entre ton code à 4 chiffres
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 22 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: pin.length > i ? 'var(--rk-accent)' : 'var(--rk-border)',
              }} />
            ))}
          </div>

          {error && (
            <p style={{ textAlign: 'center', color: 'var(--rk-rasp)', fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
            maxWidth: 280, margin: '0 auto',
          }}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button key={d} onClick={() => digit(d)} style={{
                padding: 18, borderRadius: 18, fontSize: 22, fontWeight: 700,
                background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                color: 'var(--rk-text)', textAlign: 'center',
              }}>{d}</button>
            ))}
            <button onClick={() => setPin(prev => prev.slice(0, -1))} style={{
              padding: 18, borderRadius: 18, fontSize: 16,
              background: 'var(--rk-surface2)', color: 'var(--rk-text2)', textAlign: 'center',
            }}>←</button>
            <button onClick={() => digit('0')} style={{
              padding: 18, borderRadius: 18, fontSize: 22, fontWeight: 700,
              background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
              color: 'var(--rk-text)', textAlign: 'center',
            }}>0</button>
            <button onClick={validate} disabled={pin.length < 4 || submitting} style={{
              padding: 18, borderRadius: 18, fontSize: 16, fontWeight: 800, textAlign: 'center',
              background: pin.length === 4 ? 'var(--rk-accent)' : 'var(--rk-surface2)',
              color: pin.length === 4 ? 'var(--rk-accentink)' : 'var(--rk-text3)',
              opacity: submitting ? .6 : 1,
            }}>{submitting ? '…' : 'OK'}</button>
          </div>

          <p style={{
            textAlign: 'center', fontSize: 12, color: 'var(--rk-text3)',
            marginTop: 24, lineHeight: 1.5,
          }}>
            L'espace parent sera fermé sur cet appareil.
          </p>

          <button onClick={() => { setPending(null); setPin(''); setError(null); }} style={{
            width: '100%', height: 52, borderRadius: 999, marginTop: 16,
            border: '1.5px solid var(--rk-border)', color: 'var(--rk-text2)',
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>← Retour</button>
        </div>
      </IonContent></IonPage>
    );
  }

  // ── Liste des profils ─────────────────────────────────────
  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{
        minHeight: '100%', background: 'var(--rk-bg)',
        padding: 'calc(env(safe-area-inset-top) + 32px) 26px 44px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
            Qui joue ?
          </h1>
          <p style={{ fontSize: 14, color: 'var(--rk-text3)', margin: '7px 0 0' }}>Choisis ton profil</p>
        </div>

        {loading && canList ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--rk-text3)' }}>Chargement…</div>
        ) : children.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 12px', marginBottom: 34 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rk-text)', marginBottom: 6 }}>
              Aucun profil enfant
            </div>
            <div style={{ fontSize: 14, color: 'var(--rk-text3)' }}>
              Demande à ton parent de créer ton profil.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 34 }}>
            {children.map(child => {
              const isImg = child.avatar_url?.startsWith('/images/avatars/');
              const level = gamificationService.calculateLevel(child.total_points);
              return (
                <button key={child.id} onClick={() => { setPending(child); setPin(''); setError(null); }} style={{
                  background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
                  borderRadius: 24, padding: '22px 16px', textAlign: 'center',
                }}>
                  {isImg ? (
                    <img src={child.avatar_url!} alt="" style={{
                      width: 76, height: 76, borderRadius: '50%', objectFit: 'cover',
                      marginBottom: 13, background: '#EDE7FF',
                    }} />
                  ) : (
                    <div style={{
                      width: 76, height: 76, borderRadius: '50%', margin: '0 auto 13px',
                      background: '#EDE7FF', color: 'var(--rk-indigo)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 30, fontWeight: 800,
                    }}>{child.display_name[0]?.toUpperCase()}</div>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--rk-text)', letterSpacing: '-.02em' }}>
                    {child.display_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 3 }}>
                    {child.total_points} pts · niveau {level}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button onClick={() => history.push('/parent/dashboard')} style={{
          width: '100%', height: 52, borderRadius: 999, border: '1.5px solid var(--rk-border)',
          color: 'var(--rk-text2)', fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>Espace parent</button>
      </div>
    </IonContent></IonPage>
  );
};

export default ChildSelectorPage;
