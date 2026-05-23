import React, { useEffect } from 'react';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { useAppStore } from './stores/app.store';
import { usePushNotifications } from './hooks/usePushNotifications';
import NotificationToast from './components/ui/NotificationToast';

// Pages
import SplashPage from './pages/public/SplashPage';
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

import './index.css';

setupIonicReact({ mode: 'ios' });

const App: React.FC = () => {
  const { isInitialized, user, initialize } = useAuthStore();
  const { mode } = useAppStore();
  const { toast, dismissToast, navigateToNotification } = usePushNotifications();

  useEffect(() => { initialize(); }, [initialize]);

  if (!isInitialized) {
    return <SplashPage />;
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
        <IonRouterOutlet>
          {/* Public routes */}
          <Route exact path="/splash" component={SplashPage} />
          <Route exact path="/onboarding" component={OnboardingPage} />
          <Route exact path="/login" component={LoginPage} />
          <Route exact path="/register" component={RegisterPage} />
          <Route exact path="/forgot-password" component={ForgotPasswordPage} />
          <Route exact path="/confirm" component={ConfirmPage} />
          <Route exact path="/select-child" component={ChildSelectorPage} />
          <Route exact path="/child-link" component={ChildLinkPage} />
          <Route exact path="/family" component={FamilyPage} />

          {/* Parent routes */}
          <Route path="/parent" component={ParentTabs} />

          {/* Child routes */}
          <Route path="/child" component={ChildTabs} />

          {/* Root redirect */}
          <Route exact path="/">
            {user ? (
              mode === 'child' ? <Redirect to="/child" /> : <Redirect to="/parent" />
            ) : (
              <Redirect to="/onboarding" />
            )}
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;
