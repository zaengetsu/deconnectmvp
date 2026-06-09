import React from 'react';
import { IonTabs, IonTabBar, IonTabButton, IonLabel, IonRouterOutlet } from '@ionic/react';
import { Route, Redirect } from 'react-router-dom';

const MenuIcon = ({ src, alt }: { src: string; alt: string }) => (
  <img src={src} alt={alt} style={{ width: 28, height: 28, objectFit: 'contain' }} />
);

import ParentDashboard from './ParentDashboard';
import ChildrenListPage from './ChildrenListPage';
import ValidationsPage from './ValidationsPage';
import RewardsPage from './ParentRewardsPage';
import SettingsPage from './SettingsPage';
import CreateChildPage from './CreateChildPage';
import ActivityCatalogPage from './ActivityCatalogPage';
import CreateActivityPage from './CreateActivityPage';
import CreateRewardPage from './CreateRewardPage';
import ChildDetailPage from './ChildDetailPage';
import AssignActivitiesPage from './AssignActivitiesPage';
import NotificationsPage from './NotificationsPage';

const ParentTabs: React.FC = () => (
  <IonTabs>
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
      <Route exact path="/parent/notifications" component={NotificationsPage} />
      <Route exact path="/parent"><Redirect to="/parent/dashboard" /></Route>
    </IonRouterOutlet>

    <IonTabBar slot="bottom" className="dc-tab-bar">
      <IonTabButton tab="dashboard" href="/parent/dashboard">
        <MenuIcon src="/images/menu/home.png" alt="Accueil" />
      </IonTabButton>
      <IonTabButton tab="children" href="/parent/children">
        <MenuIcon src="/images/menu/team-management.png" alt="Enfants" />
      </IonTabButton>
      <IonTabButton tab="validations" href="/parent/validations">
        <MenuIcon src="/images/menu/stamp.png" alt="Validations" />
      </IonTabButton>
      <IonTabButton tab="rewards" href="/parent/rewards">
        <MenuIcon src="/images/menu/gift.png" alt="Récompenses" />
      </IonTabButton>
      <IonTabButton tab="settings" href="/parent/settings">
        <MenuIcon src="/images/menu/gear.png" alt="Paramètres" />
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);

export default ParentTabs;
