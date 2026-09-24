import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import { io } from 'socket.io-client';
import { devicePushToken, sessionStore } from '../lib/session';
import { realtime } from '../lib/realtime';

beforeEach(() => {
  sessionStore.__reset();
  localStorage.clear();
  vi.mocked(Preferences.get).mockResolvedValue({ value: null });
  vi.mocked(io).mockClear();
});

describe('stockage de la session', () => {
  it('persiste dans les Preferences (et le localStorage en repli), prévient les abonnés', async () => {
    const seen = vi.fn();
    const off = sessionStore.onChange(seen);
    const s = { kind: 'parent' as const, accessToken: 'a', refreshToken: 'r', subjectId: 'p' };
    await sessionStore.set(s);
    expect(Preferences.set).toHaveBeenCalledWith({ key: 'rk_session_v1', value: JSON.stringify(s) });
    expect(JSON.parse(localStorage.getItem('rk_session_v1')!)).toEqual(s);
    expect(sessionStore.peek()).toEqual(s);
    await sessionStore.updateTokens('a2', 'r2');
    expect(await sessionStore.get()).toMatchObject({ accessToken: 'a2', refreshToken: 'r2', subjectId: 'p' });
    await sessionStore.clear();
    expect(seen).toHaveBeenLastCalledWith(null);
    expect(localStorage.getItem('rk_session_v1')).toBeNull();
    off();
  });

  it('relit la session au démarrage et ignore une valeur illisible', async () => {
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: JSON.stringify({ kind: 'child', accessToken: 'a', refreshToken: 'r', subjectId: 'c' }) });
    expect(await sessionStore.get()).toMatchObject({ kind: 'child', subjectId: 'c' });
    sessionStore.__reset();
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: '{pas du json' });
    expect(await sessionStore.get()).toBeNull();
    sessionStore.__reset();
    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('plugin absent'));
    localStorage.setItem('rk_session_v1', JSON.stringify({ kind: 'parent', accessToken: 'x', refreshToken: 'y', subjectId: 'p' }));
    expect(await sessionStore.get()).toMatchObject({ accessToken: 'x' });
    await sessionStore.updateTokens('z', 'w');
    sessionStore.__reset();
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: null });
    localStorage.clear();
    await sessionStore.updateTokens('ignored', 'ignored');
    expect(await sessionStore.get()).toBeNull();
  });

  it('jeton push de l’appareil', () => {
    expect(devicePushToken.get()).toBeNull();
    devicePushToken.set('tok');
    expect(devicePushToken.get()).toBe('tok');
  });
});

describe('temps réel', () => {
  it('une connexion par session, relayée aux abonnés, fermée quand plus personne n’écoute', async () => {
    const handlers: Record<string, (arg: unknown) => void> = {};
    const socket = { on: vi.fn((ev: string, fn: (arg: unknown) => void) => { handlers[ev] = fn; }), removeAllListeners: vi.fn(), disconnect: vi.fn() };
    vi.mocked(io).mockReturnValue(socket as never);
    await sessionStore.set({ kind: 'parent', accessToken: 'at-1', refreshToken: 'rt-1', subjectId: 'p' });

    const a = vi.fn();
    const b = vi.fn();
    const offA = realtime.subscribe(a);
    const offB = realtime.subscribe(b);
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    expect(vi.mocked(io).mock.calls[0]).toEqual(['http://localhost:3000/realtime', expect.objectContaining({ auth: { token: 'at-1' } })]);
    handlers.notification({ id: 'n1' });
    handlers.notification({});
    expect(a).toHaveBeenCalledWith('n1');
    expect(b).toHaveBeenCalledTimes(1);

    // Nouveau jeton : reconnexion avec le nouveau.
    await sessionStore.updateTokens('at-2', 'rt-2');
    await vi.waitFor(() => expect(io).toHaveBeenCalledTimes(2));
    expect(vi.mocked(io).mock.calls[1][1]).toMatchObject({ auth: { token: 'at-2' } });

    offA();
    offB();
    expect(socket.disconnect).toHaveBeenCalled();
    await sessionStore.clear();
  });

  it('sans session : aucune connexion', async () => {
    const off = realtime.subscribe(vi.fn());
    await Promise.resolve();
    expect(io).not.toHaveBeenCalled();
    off();
  });
});
