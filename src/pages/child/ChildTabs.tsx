import React, { useEffect, useState } from 'react';
import { IonRouterOutlet } from '@ionic/react';
import { Route, Switch, Redirect, useHistory } from 'react-router-dom';
import { RkShell, RkSheet, useRk } from '../../components/rk/RkShell';
import { RkTabBar } from '../../components/rk/RkTabBar';
import { useGlobalSwipe } from '../../hooks/useSwipe';
import { useRkBack, parentOf } from '../../hooks/useRkBack';
import { useAppStore } from '../../stores/app.store';
import { activitiesService } from '../../features/activities/activities.service';
import type { ChildActivity } from '../../types/database.types';

import ChildHomePage from './ChildHomePage';
import ChildActivitiesPage from './ChildActivitiesPage';
import ChildPointsPage from './ChildPointsPage';
import ChildRewardsPage from './ChildRewardsPage';
import ChildProfilePage from './ChildProfilePage';
import ChildNotificationsPage from './ChildNotificationsPage';

/**
 * Navigation enfant — quatre onglets et le bouton « C'est fait ! » au centre,
 * qui ouvre la liste des défis en cours à envoyer aux parents.
 */
const ChildChrome: React.FC = () => {
  const history = useHistory();
  const { selectedChild } = useAppStore();
  const { sheet, openSheet, closeSheet } = useRk();
  const [todo, setTodo] = useState<ChildActivity[]>([]);

  useEffect(() => {
    if (!selectedChild || sheet !== 'plusC') return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await activitiesService.getChildActivities(selectedChild.id);
        if (!cancelled) setTodo(all.filter(ca => ca.status === 'selected' || ca.status === 'available').slice(0, 6));
      } catch { /* liste vide */ }
    })();
    return () => { cancelled = true; };
  }, [selectedChild?.id, sheet]);

  // Glisser le doigt passe d'un onglet à l'autre (écrans racines uniquement)
  const TAB_PATHS = ['/child/home', '/child/activities', '/child/rewards', '/child/profile'];
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
          { icon: 'home',    label: 'Accueil', path: '/child/home' },
          { icon: 'acts',    label: 'Défis',   path: '/child/activities' },
          { icon: 'gift',    label: 'Cadeaux', path: '/child/rewards' },
          { icon: 'profile', label: 'Profil',  path: '/child/profile' },
        ]}
        fab={<>C'est<br />fait !</>}
        onFab={() => openSheet('plusC')}
        fabStyle={{
          background: 'var(--rk-accent)', color: 'var(--rk-accentink)',
          fontSize: 11, fontWeight: 800, textAlign: 'center', lineHeight: 1.1,
          boxShadow: '0 10px 24px -6px var(--rk-accentshadow)',
        }}
      />

      <RkSheet
        open={sheet === 'plusC'}
        onClose={closeSheet}
        title="Qu'as-tu terminé ?"
        subtitle="Choisis le défi à envoyer à tes parents"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {todo.length === 0 ? (
            <div style={{ fontSize: 14, color: 'var(--rk-text3)', padding: '18px 2px' }}>
              Aucun défi en cours. Va en choisir un dans l'onglet Défis !
            </div>
          ) : todo.map(ca => (
            <button
              key={ca.id}
              onClick={() => { closeSheet(); history.push('/child/activities'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, width: '100%',
                background: 'var(--rk-surface2)', borderRadius: 16, padding: 14,
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: 13, background: 'var(--rk-sagesoft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <img src="/images/categories/eco.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--rk-text)' }}>
                  {ca.activity?.title ?? 'Mon défi'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>
                  {ca.activity?.points ?? 0} points
                </div>
              </div>
            </button>
          ))}
        </div>
      </RkSheet>
    </>
  );
};

const ChildTabs: React.FC = () => (
  <RkShell space="child">
    <IonRouterOutlet>
      <Switch>
        <Route exact path="/child/home" component={ChildHomePage} />
        <Route exact path="/child/activities" component={ChildActivitiesPage} />
        <Route exact path="/child/points" component={ChildPointsPage} />
        <Route exact path="/child/rewards" component={ChildRewardsPage} />
        <Route exact path="/child/notifications" component={ChildNotificationsPage} />
        <Route exact path="/child/profile" component={ChildProfilePage} />
        <Route exact path="/child"><Redirect to="/child/home" /></Route>
      </Switch>
    </IonRouterOutlet>
    <ChildChrome />
  </RkShell>
);

export default ChildTabs;
