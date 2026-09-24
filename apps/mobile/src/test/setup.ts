import '@testing-library/jest-dom';
import React from 'react';

// Mock Ionic components
vi.mock('@ionic/react', () => ({
  IonApp: (props: any) => React.createElement('div', { 'data-testid': 'ion-app' }, props.children),
  IonPage: (props: any) => React.createElement('div', { 'data-testid': 'ion-page' }, props.children),
  IonContent: (props: any) => React.createElement('div', { 'data-testid': 'ion-content' }, props.children),
  IonTabs: (props: any) => React.createElement('div', { 'data-testid': 'ion-tabs' }, props.children),
  IonTabBar: (props: any) => React.createElement('div', { 'data-testid': 'ion-tab-bar' }, props.children),
  IonTabButton: (props: any) => React.createElement('div', { 'data-testid': 'ion-tab-button' }, props.children),
  IonRouterOutlet: (props: any) => React.createElement('div', { 'data-testid': 'ion-router-outlet' }, props.children),
  IonIcon: () => React.createElement('span', { 'data-testid': 'ion-icon' }),
  IonLabel: (props: any) => React.createElement('span', { 'data-testid': 'ion-label' }, props.children),
  setupIonicReact: vi.fn(),
}));

vi.mock('@ionic/react-router', () => ({
  IonReactRouter: (props: any) => React.createElement('div', null, props.children),
}));

// Temps réel : pas de vraie connexion WebSocket pendant les tests.
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: vi.fn(), removeAllListeners: vi.fn(), disconnect: vi.fn() })),
}));

// Mock Capacitor Preferences (session enfant persistée)
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ value: null }),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
