import React, { useEffect } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';

/**
 * Splash — porté de la maquette Rekonect (écran splash).
 * Deux usages : écran d'attente pendant l'initialisation (`waiting`), et
 * premier écran d'un visiteur non connecté (« Toucher pour continuer » → onboarding,
 * avec avance automatique après 2,8 s).
 */
const Art: React.FC<{ waiting?: boolean; onTap?: () => void }> = ({ waiting, onTap }) => (
  <div
    className="rk-app rk-screen"
    onClick={onTap}
    style={{
      height: '100%', minHeight: '100vh', width: '100%', position: 'relative',
      background: '#3C41A8',
      backgroundImage:
        'radial-gradient(circle at 50% 118%, rgba(255,148,105,.5) 0 30%, transparent 31%),' +
        'radial-gradient(circle at 50% 118%, rgba(255,255,255,.13) 32%, transparent 33%),' +
        'radial-gradient(circle at 50% 118%, rgba(255,255,255,.13) 52%, transparent 53%),' +
        'radial-gradient(circle at 50% 118%, rgba(255,255,255,.13) 72%, transparent 73%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 22, color: '#fff',
    }}
  >
    <div style={{ width: 62, height: 62, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 16, width: 34, height: 34, borderRadius: '50%', border: '3.5px solid #fff' }} />
      <div style={{ position: 'absolute', left: 22, top: 16, width: 34, height: 34, borderRadius: '50%', border: '3.5px solid #FF9469' }} />
    </div>

    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.04em' }}>Rekonect</div>
      <div style={{ fontSize: 14, fontWeight: 600, opacity: .7, marginTop: 6 }}>Moins d'écran, plus de vrai</div>
    </div>

    {!waiting && (
      <div style={{
        position: 'absolute', bottom: 'calc(56px + env(safe-area-inset-bottom))', left: 0, right: 0,
        textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.5)',
      }}>Toucher pour continuer</div>
    )}
  </div>
);

/** Version plein écran hors routeur, pendant l'initialisation de la session. */
export const SplashWaiting: React.FC = () => <Art waiting />;

const SplashPage: React.FC = () => {
  const history = useHistory();
  const go = () => history.replace('/onboarding');

  useEffect(() => {
    const t = window.setTimeout(go, 2800);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <IonPage><IonContent fullscreen scrollY={false}>
      <Art onTap={go} />
    </IonContent></IonPage>
  );
};

export default SplashPage;
