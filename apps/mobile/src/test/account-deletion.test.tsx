import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route } from 'react-router-dom';
import { json, mockApi, signedInAs } from './http';
import { sessionStore } from '../lib/session';

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

import AccountPage from '../pages/parent/AccountPage';
import { useAuthStore } from '../stores/auth.store';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el: Element) => act(async () => { (el as HTMLElement).click(); });
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderPage() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let path = '';
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/parent/account']}>
        <Route path="/parent/account" component={AccountPage} />
        <Route path="*" render={({ location }) => { path = location.pathname; return null; }} />
      </MemoryRouter>,
    );
  });
  return { host, path: () => path };
}

describe('Suppression du compte depuis « Mon compte »', () => {
  beforeEach(async () => {
    await signedInAs('parent');
    useAuthStore.setState({ user: { id: 'parent-1', email: 'camille@test.fr' } as never, session: await sessionStore.get() });
  });

  it('demande confirmation et mot de passe, appelle DELETE /v1/auth/account, ferme la session et revient à l’accueil', async () => {
    const api = mockApi({ 'DELETE /v1/auth/account': () => new Response(null, { status: 204 }) });
    const { host, path } = await renderPage();

    await click(button(host, 'Supprimer mon compte'));
    expect(host.textContent).toContain('Cette action est irréversible');
    expect(host.textContent).toContain('profils de vos enfants');
    const confirm = button(host, 'Supprimer définitivement');
    expect(confirm.disabled).toBe(true);

    await type(host.querySelector('input[aria-label="Mot de passe pour supprimer le compte"]') as HTMLInputElement, 'motdepasse');
    await click(button(host, 'Supprimer définitivement'));
    await flush();

    const call = api.calls.find((c) => c.method === 'DELETE');
    expect(call).toMatchObject({ path: '/v1/auth/account', body: { password: 'motdepasse' }, auth: 'Bearer at-parent-1' });
    expect(api.list()).not.toContain('POST /v1/auth/logout');
    expect(await sessionStore.get()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(path()).toBe('/onboarding');
  });

  it('mot de passe refusé : le compte reste, le message s’affiche', async () => {
    mockApi({ 'DELETE /v1/auth/account': () => json(401, { code: 'INVALID_CREDENTIALS', message: 'Mot de passe incorrect' }) });
    const { host } = await renderPage();
    await click(button(host, 'Supprimer mon compte'));
    await type(host.querySelector('input[aria-label="Mot de passe pour supprimer le compte"]') as HTMLInputElement, 'faux');
    await click(button(host, 'Supprimer définitivement'));
    await flush();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Mot de passe incorrect');
    expect(await sessionStore.get()).not.toBeNull();

    await click(button(host, 'Annuler'));
    expect(button(host, 'Supprimer mon compte')).toBeTruthy();
  });
});
