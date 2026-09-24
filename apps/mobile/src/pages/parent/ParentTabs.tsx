import React, { useEffect, useState } from 'react';
import { IonRouterOutlet } from '@ionic/react';
import { Route, Redirect, useHistory } from 'react-router-dom';
import { RkShell, RkSheet, RkSheetItem, useRk } from '../../components/rk/RkShell';
import { useGlobalSwipe } from '../../hooks/useSwipe';
import { useRkBack, parentOf } from '../../hooks/useRkBack';
import { RkTabBar, RkPlus } from '../../components/rk/RkTabBar';
import { useAuthStore } from '../../stores/auth.store';
import { activitiesService } from '../../features/activities/activities.service';

import ParentDashboard from './ParentDashboard';
import ChildrenListPage from './ChildrenListPage';
import ValidationsPage from './ValidationsPage';
import RewardsPage from './ParentRewardsPage';
import SettingsPage from './SettingsPage';
import AccountPage from './AccountPage';
import CreateChildPage from './CreateChildPage';
import ActivityCatalogPage from './ActivityCatalogPage';
import CreateActivityPage from './CreateActivityPage';
import CreateRewardPage from './CreateRewardPage';
import ChildDetailPage from './ChildDetailPage';
import AssignActivitiesPage from './AssignActivitiesPage';
import NotificationsPage from './NotificationsPage';
import NotificationPreferencesPage from './NotificationPreferencesPage';

/**
 * Navigation parent — quatre onglets et un bouton central « + », comme dans
 * la maquette. Le centre de notifications et les réglages ne sont plus des
 * onglets : on y accède depuis l'en-tête du tableau de bord.
 */
const ParentChrome: React.FC = () => {
  const history = useHistory();
  const { user } = useAuthStore();
  const { sheet, openSheet, closeSheet } = useRk();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const pending = await activitiesService.getPendingValidations(user.id);
        if (!cancelled) setPendingCount(pending.length);
      } catch { /* le badge reste à zéro */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, history.location.pathname]);

  const go = (path: string) => { closeSheet(); history.push(path); };

  // Glisser le doigt passe d'un onglet à l'autre (sur les écrans racines uniquement)
  const TAB_PATHS = ['/parent/dashboard', '/parent/children', '/parent/validations', '/parent/rewards'];
  const swipeTab = (dir: 1 | -1) => {
    const i = TAB_PATHS.indexOf(history.location.pathname);
    const next = TAB_PATHS[i + dir];
    if (i < 0 || !next || sheet) return false;
    history.push(next);
    return true;
  };
  // Sur une sous-page (fiche, formulaire, réglages…), glisser vers la droite = retour
  const parentPath = parentOf(history.location.pathname);
  const back = useRkBack(parentPath ?? TAB_PATHS[0]);
  const swipeBack = () => {
    if (!parentPath || sheet) return false;
    back();
    return true;
  };
  useGlobalSwipe({ onLeft: () => swipeTab(1), onRight: () => swipeTab(-1) || swipeBack() });

  return (
    <>
      <RkTabBar
        tabs={[
          { icon: 'home',  label: 'Accueil',     path: '/parent/dashboard' },
          { icon: 'kids',  label: 'Enfants',     path: '/parent/children' },
          { icon: 'valid', label: 'Validations', path: '/parent/validations', badge: pendingCount },
          { icon: 'gift',  label: 'Récompenses', path: '/parent/rewards' },
        ]}
        fab={<RkPlus />}
        onFab={() => openSheet('plusP')}
      />

      <RkSheet open={sheet === 'plusP'} onClose={closeSheet} eyebrow="CRÉER">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <RkSheetItem
            icon="/images/categories/calendar.png" iconBg="var(--rk-indigosoft)"
            title="Assigner une activité" subtitle="À un ou plusieurs enfants"
            onClick={() => go('/parent/children')}
          />
          <RkSheetItem
            icon="/images/categories/watercolor.png" iconBg="var(--rk-accentsoft)"
            title="Créer une activité" subtitle="Sur mesure pour votre famille"
            onClick={() => go('/parent/create-activity')}
          />
          <RkSheetItem
            icon="/images/categories/emoji.png" iconBg="var(--rk-sagesoft)"
            title="Créer une récompense" subtitle="Ce que les points permettent"
            onClick={() => go('/parent/create-reward')}
          />
          <RkSheetItem
            icon="/images/categories/family.png" iconBg="var(--rk-ambersoft)"
            title="Ajouter un enfant" subtitle="Nouveau profil"
            onClick={() => go('/parent/create-child')}
          />
        </div>
      </RkSheet>
    </>
  );
};

const ParentTabs: React.FC = () => (
  <RkShell space="parent">
    <IonRouterOutlet>
      <Route exact path="/parent/dashboard" component={ParentDashboard} />
      <Route exact path="/parent/children" component={ChildrenListPage} />
      <Route exact path="/parent/create-child" component={CreateChildPage} />
      <Route exact path="/parent/children/:childId" component={ChildDetailPage} />
      <Route exact path="/parent/children/:childId/assign" component={AssignActivitiesPage} />
      <Route exact path="/parent/activities" component={ActivityCatalogPage} />
      <Route exact path="/parent/create-activity" component={CreateActivityPage} />
      <Route exact path="/parent/rewards" component={RewardsPage} />
      <Route exact path="/parent/create-reward" component={CreateRewardPage} />
      <Route exact path="/parent/validations" component={ValidationsPage} />
      <Route exact path="/parent/settings" component={SettingsPage} />
      <Route exact path="/parent/account" component={AccountPage} />
      <Route exact path="/parent/notifications" component={NotificationsPage} />
      <Route exact path="/parent/notification-preferences" component={NotificationPreferencesPage} />
      <Route exact path="/parent"><Redirect to="/parent/dashboard" /></Route>
    </IonRouterOutlet>
    <ParentChrome />
  </RkShell>
);

export default ParentTabs;
