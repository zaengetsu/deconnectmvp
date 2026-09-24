import React, { useEffect } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';

/**
 * Splash — porté de la maquette Rekonect (écran splash).
 * Deux usages : écran d'attente pendant l'initialisation (`waiting`, web
 * uniquement : sur mobile le splash natif le recouvre), et premier écran d'un
 * visiteur non connecté (« Toucher pour continuer » → onboarding, avance
 * automatique après 2,8 s).
 *
 * Il affiche exactement la même image que le splash natif (resources/splash.png,
 * copiée dans public/) avec le même cadrage (`cover`, centré, comme
 * scaleAspectFill / CENTER_CROP) : le passage natif → web est invisible et
 * l'utilisateur ne voit qu'un seul splash.
 */
export const SPLASH_IMAGE = '/splash.png';

const Art: React.FC<{ waiting?: boolean; onTap?: () => void }> = ({ waiting, onTap }) => (
  <div
    className="rk-app rk-screen"
    data-testid="rk-splash"
    onClick={onTap}
    style={{
      height: '100%', minHeight: '100vh', width: '100%', position: 'relative',
      backgroundColor: '#3C41A8',
      backgroundImage: `url(${SPLASH_IMAGE})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      cursor: onTap ? 'pointer' : undefined,
    }}
  >
    {/* Le logo et le slogan sont dans l'image ; texte réservé aux lecteurs d'écran. */}
    <h1 style={srOnly}>Rekonect — Moins d'écran, plus de vrai</h1>

    {!waiting && (
      <div style={{
        position: 'absolute', bottom: 'calc(56px + env(safe-area-inset-bottom))', left: 0, right: 0,
        textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.7)',
        animation: 'rk-splash-hint .4s ease-out .3s both',
      }}>Toucher pour continuer</div>
    )}
    <style>{'@keyframes rk-splash-hint{from{opacity:0}to{opacity:1}}'}</style>
  </div>
);

const srOnly: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
};

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
