import React from 'react';
import { IonTabs, IonTabBar, IonTabButton, IonLabel, IonRouterOutlet } from '@ionic/react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { Home, Zap, Star, Gift, User } from 'lucide-react';

import ChildHomePage from './ChildHomePage';
import ChildActivitiesPage from './ChildActivitiesPage';
import ChildPointsPage from './ChildPointsPage';
import ChildRewardsPage from './ChildRewardsPage';
import ChildProfilePage from './ChildProfilePage';

const TAB_ITEMS = [
  { tab: 'home',       href: '/child/home',       Icon: Home,  label: 'Accueil' },
  { tab: 'activities', href: '/child/activities',  Icon: Zap,   label: 'Activités' },
  { tab: 'points',     href: '/child/points',      Icon: Star,  label: 'Points' },
  { tab: 'rewards',    href: '/child/rewards',     Icon: Gift,  label: 'Récompenses' },
  { tab: 'profile',    href: '/child/profile',     Icon: User,  label: 'Profil' },
];

const ChildTabs: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Switch>
        <Route exact path="/child/home"       component={ChildHomePage} />
        <Route exact path="/child/activities" component={ChildActivitiesPage} />
        <Route exact path="/child/points"     component={ChildPointsPage} />
        <Route exact path="/child/rewards"    component={ChildRewardsPage} />
        <Route exact path="/child/profile"    component={ChildProfilePage} />
        <Route exact path="/child"><Redirect to="/child/home" /></Route>
      </Switch>
    </IonRouterOutlet>

    {/* ── Child Tab Bar — blue active + labels ── */}
    <IonTabBar slot="bottom" className="dc-child-tab-bar">
      {TAB_ITEMS.map(({ tab, href, Icon, label }) => (
        <IonTabButton key={tab} tab={tab} href={href}>
          <Icon size={22} strokeWidth={1.8} />
          <IonLabel style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{label}</IonLabel>
        </IonTabButton>
      ))}
    </IonTabBar>
  </IonTabs>
);

export default ChildTabs;
