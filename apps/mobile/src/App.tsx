import React, { useEffect, useState } from 'react';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect, useHistory } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { LINK_SCHEME, parseChildLink } from './lib/childLink';
import { useAuthStore } from './stores/auth.store';
import { useAppStore } from './stores/app.store';
import { usePushNotifications } from './hooks/usePushNotifications';
import { childSession } from './features/auth/child.session';
import NotificationToast from './components/ui/NotificationToast';

// Pages
import SplashPage, { SplashWaiting } from './pages/public/SplashPage';
import OnboardingPage from './pages/public/OnboardingPage';
import LoginPage from './pages/public/LoginPage';
import RegisterPage from './pages/public/RegisterPage';
import ForgotPasswordPage from './pages/public/ForgotPasswordPage';
import ConfirmPage from './pages/public/ConfirmPage';
import ParentTabs from './pages/parent/ParentTabs';
import ChildTabs from './pages/child/ChildTabs';
import ChildSelectorPage from './pages/public/ChildSelectorPage';
import ChildLinkPage from './pages/child/ChildLinkPage';
import FamilyPage from './pages/parent/FamilyPage';
import JoinFamilyPage from './pages/public/JoinFamilyPage';

import './index.css';

setupIonicReact({ mode: 'ios', swipeBackEnabled: false }); // le retour au doigt est géré par useSwipe/useRkBack

/**
 * Deep links : `rekonect://link?t=…&c=…&n=…` (QR scanné avec l'appareil photo
 * du téléphone, ou lien ouvert depuis un message) → écran de liaison enfant,
 * directement à l'étape PIN. Gère l'app déjà ouverte (appUrlOpen) et le
 * démarrage à froid (getLaunchUrl).
 */
const DeepLinkHandler: React.FC = () => {
  const history = useHistory();
  useEffect(() => {
    const route = (url: string | undefined | null) => {
      if (!url) return;
      const parsed = parseChildLink(url);
      if (!parsed) return;
      const q = new URLSearchParams();
      q.set(parsed.token.length === 32 ? 't' : 'c', parsed.token);
      if (parsed.childName) q.set('n', parsed.childName);
      history.replace(`/child-link?${q.toString()}`);
    };
    let handle: { remove: () => void } | null = null;
    void (async () => {
      try {
        const launch = await CapApp.getLaunchUrl();
        if (launch?.url?.startsWith(`${LINK_SCHEME}://`)) route(launch.url);
      } catch { /* web : pas de plugin */ }
      try {
        handle = await CapApp.addListener('appUrlOpen', ({ url }) => route(url));
      } catch { /* web */ }
    })();
    return () => { handle?.remove(); };
  }, [history]);
  return null;
};

const App: React.FC = () => {
  const { isInitialized, user, initialize } = useAuthStore();
  const { selectedChild, selectChild } = useAppStore();
  const { toast, dismissToast, navigateToNotification } = usePushNotifications();
  // 'idle' → 'running' → 'done' : tant que la restauration de l'enfant n'est
  // pas terminée, on n'affiche PAS le routeur (sinon /child redirigerait vers
  // /login pendant la fenêtre où l'enfant n'est pas encore chargé).
  const [childRestore, setChildRestore] = useState<'idle' | 'running' | 'done'>('idle');

  // CRITICAL: empty deps [] — initialize must only run ONCE on mount.
  // If `initialize` is in the deps array, it re-fires on every re-render
  // because Zustand action references are unstable between renders.
  // Each re-fire re-calls getSession() and fetchProfile() unnecessarily.
  useEffect(() => {
    console.log('[App] Mounting — calling initialize()');
    initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session enfant : identité propre (pas la session du parent) ─────
  // Une session anonyme rattachée à children.auth_user_id survit au reload,
  // mais l'état Zustand non : on recharge l'enfant lié à cette session.
  const isChildSession = childSession.isChildUser(user);
  const isParentSession = !!user && !user.is_anonymous;

  useEffect(() => {
    if (!isChildSession) {
      // réarme pour une prochaine session enfant (hors du corps synchrone de l'effet)
      const id = window.setTimeout(() => setChildRestore('idle'), 0);
      return () => window.clearTimeout(id);
    }
    if (selectedChild || childRestore !== 'idle') return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) setChildRestore('running');
      const child = await childSession.restore();
      if (cancelled) return;
      if (child) {
        selectChild(child);
      } else {
        // Session anonyme orpheline (enfant supprimé, lien perdu) : on la ferme
        // plutôt que de laisser l'app tourner en rond entre /child et /login.
        await childSession.end();
      }
      setChildRestore('done');
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChildSession, selectedChild]);

  if (!isInitialized || (isChildSession && !selectedChild && childRestore !== 'done')) {
    // Splash de la maquette (indigo) en attendant l'initialisation de la session.
    return <SplashWaiting />;
  }

  return (
    <IonApp>
      {/* In-app notification toast */}
      {toast && (
        <NotificationToast
          notification={toast}
          onTap={navigateToNotification}
          onDismiss={dismissToast}
        />
      )}

      <IonReactRouter>
        <DeepLinkHandler />
        <IonRouterOutlet>
          {/* Public routes */}
          {/* Écrans d'entrée : un parent connecté est renvoyé chez lui, un
              enfant relié dans son espace — plus de formulaire de connexion
              affiché par-dessus une session valide. */}
          <Route exact path="/splash">
            {isParentSession ? <Redirect to="/parent" /> : isChildSession && selectedChild ? <Redirect to="/child" /> : <SplashPage />}
          </Route>
          <Route exact path="/onboarding">
            {isParentSession ? <Redirect to="/parent" /> : isChildSession && selectedChild ? <Redirect to="/child" /> : <OnboardingPage />}
          </Route>
          <Route exact path="/login">
            {isParentSession ? <Redirect to="/parent" /> : isChildSession && selectedChild ? <Redirect to="/child" /> : <LoginPage />}
          </Route>
          <Route exact path="/register">
            {isParentSession ? <Redirect to="/parent" /> : <RegisterPage />}
          </Route>
          <Route exact path="/forgot-password" component={ForgotPasswordPage} />
          <Route exact path="/confirm" component={ConfirmPage} />
          <Route exact path="/select-child" component={ChildSelectorPage} />
          <Route exact path="/child-link" component={ChildLinkPage} />
          <Route exact path="/family" component={FamilyPage} />
          <Route exact path="/join-family" component={JoinFamilyPage} />

          {/* Parent routes — session parent uniquement */}
          <Route path="/parent">
            {isParentSession ? <ParentTabs /> : <Redirect to="/login" />}
          </Route>

          {/* Child routes — session enfant uniquement (PIN + appareil lié) */}
          <Route path="/child">
            {isChildSession && selectedChild ? <ChildTabs /> : <Redirect to="/login" />}
          </Route>

          {/* Root redirect */}
          <Route exact path="/">
            {isChildSession ? (
              <Redirect to="/child" />
            ) : isParentSession ? (
              <Redirect to="/parent" />
            ) : (
              <Redirect to="/splash" />
            )}
          </Route>
          
          {/* Fallback route for iOS capacitor://localhost/index.html */}
          <Route>
            <Redirect to="/" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
