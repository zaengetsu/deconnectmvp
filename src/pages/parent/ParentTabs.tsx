import React from 'react';
import { IonTabs, IonTabBar, IonTabButton, IonLabel, IonRouterOutlet } from '@ionic/react';
import { Route, Redirect } from 'react-router-dom';
import { Home, Users, CheckSquare, Gift, Settings } from 'lucide-react';

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

const ParentTabs: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Route exact path="/parent/dashboard" component={ParentDashboard} />
      <Route exact path="/parent/children" component={ChildrenListPage} />
      <Route exact path="/parent/create-child" component={CreateChildPage} />
      <Route exact path="/parent/children/:childId" component={ChildDetailPage} />
      <Route exact path="/parent/activities" component={ActivityCatalogPage} />
      <Route exact path="/parent/create-activity" component={CreateActivityPage} />
      <Route exact path="/parent/rewards" component={RewardsPage} />
      <Route exact path="/parent/create-reward" component={CreateRewardPage} />
      <Route exact path="/parent/validations" component={ValidationsPage} />
      <Route exact path="/parent/settings" component={SettingsPage} />
      <Route exact path="/parent"><Redirect to="/parent/dashboard" /></Route>
    </IonRouterOutlet>

    <IonTabBar slot="bottom" className="dc-tab-bar">
      <IonTabButton tab="dashboard" href="/parent/dashboard">
        <Home size={22} strokeWidth={1.8} />
      </IonTabButton>
      <IonTabButton tab="children" href="/parent/children">
        <Users size={22} strokeWidth={1.8} />
      </IonTabButton>
      <IonTabButton tab="validations" href="/parent/validations">
        <CheckSquare size={22} strokeWidth={1.8} />
      </IonTabButton>
      <IonTabButton tab="rewards" href="/parent/rewards">
        <Gift size={22} strokeWidth={1.8} />
      </IonTabButton>
      <IonTabButton tab="settings" href="/parent/settings">
        <Settings size={22} strokeWidth={1.8} />
      </IonTabButton>
    </IonTabBar>
  </IonTabs>
);

export default ParentTabs;
