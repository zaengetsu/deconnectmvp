import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';

const native = vi.hoisted(() => ({ isNative: true, hide: vi.fn(() => Promise.resolve()) }));
vi.mock('@capacitor/core', async (orig) => {
  const mod = await orig<typeof import('@capacitor/core')>();
  return { ...mod, Capacitor: { ...mod.Capacitor, isNativePlatform: () => native.isNative } };
});
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: native.hide } }));

import { __resetNativeSplash, armNativeSplashFallback, hideNativeSplash } from '../lib/nativeSplash';
import SplashPage, { SplashWaiting, SPLASH_IMAGE } from '../pages/public/SplashPage';

describe('splash natif — un seul splash', () => {
  beforeEach(() => {
    __resetNativeSplash();
    native.hide.mockClear();
    native.isNative = true;
  });

  it('masque le splash natif une seule fois, en fondu', () => {
    hideNativeSplash();
    hideNativeSplash();
    expect(native.hide).toHaveBeenCalledTimes(1);
    expect(native.hide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
  });

  it('ne fait rien sur le web', () => {
    native.isNative = false;
    hideNativeSplash();
    expect(native.hide).not.toHaveBeenCalled();
  });

  it('filet de sécurité : masque après le délai même si l’app ne signale rien', () => {
    vi.useFakeTimers();
    armNativeSplashFallback(7000);
    vi.advanceTimersByTime(6999);
    expect(native.hide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(native.hide).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('le splash natif doit rester jusqu’à ce que l’app le masque (config)', async () => {
    const { default: config } = await import('../../capacitor.config');
    expect(config.plugins?.SplashScreen).toMatchObject({ launchAutoHide: false });
  });
});

describe('splash web — même image que le natif', () => {
  it('attente : image du splash natif, sans « Toucher pour continuer »', () => {
    render(<SplashWaiting />);
    const el = screen.getByTestId('rk-splash');
    expect(el.style.backgroundImage).toContain(SPLASH_IMAGE);
    expect(el.style.backgroundSize).toBe('cover');
    expect(screen.queryByText('Toucher pour continuer')).toBeNull();
    expect(screen.getByRole('heading', { name: /Rekonect/ })).toBeTruthy();
  });

  it('visiteur : même image + invitation à continuer, avance vers l’onboarding', () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/splash']}>
        <Route exact path="/splash"><SplashPage /></Route>
        <Route exact path="/onboarding"><div>onboarding</div></Route>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('rk-splash').style.backgroundImage).toContain(SPLASH_IMAGE);
    expect(screen.getByText('Toucher pour continuer')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2800);
    });
    expect(screen.getByText('onboarding')).toBeTruthy();
    vi.useRealTimers();
  });
});
