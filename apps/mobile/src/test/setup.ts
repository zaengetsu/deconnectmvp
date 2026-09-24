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

// Mock Supabase
vi.mock('../lib/supabase', () => {
  const mockChain = () => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'test@test.com' } } }),
        signInWithPassword: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'anon-1', is_anonymous: true } }, error: null }),
        resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn().mockImplementation(mockChain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      removeChannel: vi.fn(),
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
    },
  };
});

// Mock Capacitor Preferences (session enfant persistée)
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ value: null }),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
