import { HttpClient, MemorySessionStore } from '@rekonect/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthLayout, ForgotPasswordForm, LoginForm, Logo, readAsDataUrl, readAsText, ResetPasswordForm, saveBlob, SessionProvider, useSession, WrongPortalError } from '../src';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function makeHttp(handler: (url: string, init: RequestInit) => Response, session: { accessToken: string; refreshToken: string } | null = null) {
  return new HttpClient({ baseUrl: 'http://api', store: new MemorySessionStore(session), fetch: (async (u: string, i: RequestInit) => handler(u, i)) as never });
}

function Who() {
  const { status, user, logout } = useSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span>{user?.email}</span>
      <button onClick={() => void logout()}>Déconnexion</button>
    </div>
  );
}

describe('session', () => {
  it('restaure la session existante puis se déconnecte', async () => {
    const http = makeHttp((url) => (url.endsWith('/v1/auth/me') ? json(200, { kind: 'user', user: { id: 'u', email: 'admin@rekonect.app', role: 'admin' } }) : new Response(null, { status: 204 })), { accessToken: 'a', refreshToken: 'r' });
    render(<SessionProvider baseUrl="" storageKey="k" roles={['admin']} http={http}><Who /></SessionProvider>);
    expect(await screen.findByText('admin@rekonect.app')).toBeInTheDocument();
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    await userEvent.click(screen.getByText('Déconnexion'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(http.session).toBeNull();
  });

  it('session invalide ou absente → anonyme ; fin de session externe', async () => {
    const http = makeHttp(() => json(401, {}), { accessToken: 'a', refreshToken: 'r' });
    render(<SessionProvider baseUrl="" storageKey="k" roles={['admin']} http={http}><Who /></SessionProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    const empty = makeHttp(() => json(200, {}));
    const { unmount } = render(<SessionProvider baseUrl="http://x" storageKey="k2" roles={['admin']}><Who /></SessionProvider>);
    await waitFor(() => expect(screen.getAllByTestId('status')[1].textContent).toBe('anonymous'));
    unmount();
    expect(empty.session).toBeNull();
    expect(() => render(<Who />)).toThrow('SessionProvider');
  });

  it('connexion : succès, identifiants faux, mauvais portail', async () => {
    let attempt = 0;
    const http = makeHttp((url) => {
      if (url.endsWith('/v1/auth/login')) {
        attempt++;
        if (attempt === 1) return json(401, { code: 'INVALID_CREDENTIALS', message: 'x' });
        if (attempt === 2) return json(200, { accessToken: 'a', refreshToken: 'r', user: { id: 'p', email: 'parent@x.fr', role: 'parent' } });
        return json(200, { accessToken: 'a', refreshToken: 'r', user: { id: 'u', email: 'julie@decathlon.fr', role: 'partner' } });
      }
      return json(500, {});
    });
    const done = vi.fn();
    render(
      <SessionProvider baseUrl="" storageKey="k" roles={['partner']} http={http}>
        <AuthLayout badge={<span>PARTENAIRES</span>} title="Connexion" subtitle="Espace partenaires"><LoginForm onSuccess={done} forgotHref="/mot-de-passe" /></AuthLayout>
        <Who />
      </SessionProvider>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'julie@decathlon.fr');
    await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Email ou mot de passe incorrect.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/compte famille/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(screen.getByText('julie@decathlon.fr')).toBeInTheDocument();
    expect(new WrongPortalError('admin').message).toMatch(/pas accès/);
  });

  it('invitation, mot de passe oublié, réinitialisation', async () => {
    const http = makeHttp((url, init) => {
      if (url.endsWith('/partner-invitations/accept')) return json(200, { accessToken: 'a', refreshToken: 'r', user: { id: 'u', email: 'n@x.fr', role: 'partner' } });
      if (url.endsWith('/password/forgot')) return json(200, { success: true });
      if (url.endsWith('/password/reset')) return JSON.parse(String(init.body)).password === 'erreur-serveur' ? json(400, { message: 'Lien expiré' }) : json(200, { success: true });
      return json(404, {});
    });
    function Accept() {
      const { acceptInvitation } = useSession();
      return <button onClick={() => void acceptInvitation('t', 'Nathalie', 'motdepasse')}>Accepter</button>;
    }
    render(
      <SessionProvider baseUrl="" storageKey="k" roles={['partner']} http={http}>
        <Accept />
        <ForgotPasswordForm loginHref="/connexion" />
        <ResetPasswordForm token="tok" loginHref="/connexion" />
        <Who />
        <Logo />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByText('Accepter'));
    expect(await screen.findByText('n@x.fr')).toBeInTheDocument();
    await userEvent.type(screen.getAllByLabelText('Email')[0], 'n@x.fr');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir un lien' }));
    expect(await screen.findByText(/lien de réinitialisation/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'erreur-serveur');
    await userEvent.type(screen.getByLabelText('Confirmation'), 'autre-chose');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Confirmation'));
    await userEvent.type(screen.getByLabelText('Confirmation'), 'erreur-serveur');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Lien expiré')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Nouveau mot de passe'));
    await userEvent.clear(screen.getByLabelText('Confirmation'));
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'bon-mot-de-passe');
    await userEvent.type(screen.getByLabelText('Confirmation'), 'bon-mot-de-passe');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Mot de passe modifié/)).toBeInTheDocument();
  });

  it('fichiers : lecture et téléchargement', async () => {
    const blob = new Blob(['a;b'], { type: 'text/csv' });
    expect(await readAsText(blob)).toBe('a;b');
    expect(await readAsDataUrl(blob)).toMatch(/^data:text\/csv;base64,/);
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();
    saveBlob(blob, 'x.csv');
    vi.runAllTimers();
    vi.useRealTimers();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
