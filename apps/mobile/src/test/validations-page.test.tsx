import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../stores/auth.store', () => ({
  useAuthStore: () => ({ user: { id: 'parent-1', email: 'p@x.fr' } }),
}));
vi.mock('../features/activities/activities.service', () => ({
  activitiesService: {
    getPendingValidations: vi.fn().mockResolvedValue([]),
    validateActivity: vi.fn(),
    rejectActivity: vi.fn(),
  },
}));
vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual<typeof import('@ionic/react')>('@ionic/react');
  return {
    ...actual,
    IonPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    IonContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    IonIcon: () => <i />,
    useIonViewWillEnter: () => {},
  };
});

import ValidationsPage from '../pages/parent/ValidationsPage';
import { RkShell } from '../components/rk/RkShell';

describe('ValidationsPage', () => {
  it('affiche un état vide explicite quand rien n’est à valider', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/parent/validations']}>
          <RkShell space="parent"><ValidationsPage /></RkShell>
        </MemoryRouter>,
      );
    });
    // laisse la promesse de chargement se résoudre
    await act(async () => { await Promise.resolve(); });

    const text = host.textContent ?? '';
    expect(text).toContain('Validations');
    expect(text).toContain('Rien à valider');
    expect(text).toContain('Assigner une activité');
    root.unmount();
  });
});
