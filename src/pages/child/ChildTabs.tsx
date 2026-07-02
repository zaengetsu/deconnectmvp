import React from 'react';
import { IonTabs, IonTabBar, IonTabButton, IonLabel, IonRouterOutlet } from '@ionic/react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { Bell } from 'lucide-react';

import ChildHomePage from './ChildHomePage';
import ChildActivitiesPage from './ChildActivitiesPage';
import ChildPointsPage from './ChildPointsPage';
import ChildRewardsPage from './ChildRewardsPage';
import ChildProfilePage from './ChildProfilePage';
import ChildNotificationsPage from './ChildNotificationsPage';

const MenuIcon = ({ src, alt }: { src: string; alt: string }) => (
  <img src={src} alt={alt} style={{ width: 28, height: 28, objectFit: 'contain' }} />
);

const TAB_ITEMS = [
  { tab: 'home',          href: '/child/home',          content: <MenuIcon src="/images/menu/home.png" alt="Accueil" />,                    label: 'Accueil' },
  { tab: 'activities',    href: '/child/activities',     content: <MenuIcon src="/images/menu/account-activity.png" alt="Activités" />,  label: 'Activités' },
  { tab: 'points',        href: '/child/points',         content: <MenuIcon src="/images/menu/star.png" alt="Points" />,                    label: 'Points' },
  { tab: 'rewards',       href: '/child/rewards',        content: <MenuIcon src="/images/menu/gift.png" alt="Récompenses" />,             label: 'Récompenses' },
  { tab: 'notifications', href: '/child/notifications',  content: <Bell size={28} strokeWidth={1.8} color="#6C5CE7" />,                   label: 'Notifs' },
];

const ChildTabs: React.FC = () => (
  <IonTabs>
    <IonRouterOutlet>
      <Switch>
        <Route exact path="/child/home"          component={ChildHomePage} />
        <Route exact path="/child/activities"    component={ChildActivitiesPage} />
        <Route exact path="/child/points"        component={ChildPointsPage} />
        <Route exact path="/child/rewards"       component={ChildRewardsPage} />
        <Route exact path="/child/notifications" component={ChildNotificationsPage} />
        <Route exact path="/child/profile"       component={ChildProfilePage} />
        <Route exact path="/child"><Redirect to="/child/home" /></Route>
      </Switch>
    </IonRouterOutlet>

    {/* ── Child Tab Bar ── */}
    <IonTabBar slot="bottom" className="dc-child-tab-bar">
      {TAB_ITEMS.map(({ tab, href, content }) => (
        <IonTabButton key={tab} tab={tab} href={href}>
          {content}
        </IonTabButton>
      ))}
    </IonTabBar>
  </IonTabs>
);

export default ChildTabs;
