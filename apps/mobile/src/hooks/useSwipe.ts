import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Glissement horizontal du doigt.
 *
 * Deux niveaux qui coopèrent :
 *  - `useSwipe()` sur la racine d'une page : passe d'une section à l'autre
 *    (« Les miennes » ↔ « Idées »…). Quand il consomme le geste, il le marque
 *    sur l'événement natif.
 *  - `useGlobalSwipe()` (document) : passe d'un onglet à l'autre, sauf si une
 *    page a déjà consommé le geste ou si l'on est au bord (rien à faire).
 *
 * Ignoré : départ dans un champ, un slider, une feuille (sheet), ou une rangée
 * qui défile réellement à l'horizontale (chips `.rk-sc`).
 */

const MIN_DX = 56;      // px
const RATIO  = 1.6;     // |dx| doit dominer |dy|
const MAX_MS = 650;

type SwipeEvent = TouchEvent & { rkSwipeHandled?: boolean };

export interface SwipeOptions {
  onLeft?: () => boolean | void;   // renvoyer false = « rien à faire ici », le geste remonte
  onRight?: () => boolean | void;
  enabled?: boolean;
}

const IGNORE = 'input, textarea, select, [data-no-swipe], .rk-sheet-panel, .rk-scrim-bg';

function shouldIgnore(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest(IGNORE)) return true;
  // Une rangée horizontale (chips) qui a vraiment du débordement garde le geste
  const sc = el.closest('.rk-sc') as HTMLElement | null;
  if (sc && sc.scrollWidth > sc.clientWidth + 4) return true;
  return false;
}

interface Track { x: number; y: number; t: number; dead: boolean }

function makeTracker(opts: SwipeOptions) {
  let track: Track | null = null;

  const start = (e: TouchEvent) => {
    if (opts.enabled === false || e.touches.length !== 1) { track = null; return; }
    const t = e.touches[0];
    track = { x: t.clientX, y: t.clientY, t: Date.now(), dead: shouldIgnore(e.target) };
  };
  const move = (e: TouchEvent) => {
    if (!track || track.dead) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - track.x), dy = Math.abs(t.clientY - track.y);
    // Le doigt part clairement à la verticale : c'est un défilement, pas un swipe
    if (dy > 12 && dy > dx) track.dead = true;
  };
  const end = (e: TouchEvent): boolean => {
    const ev = e as SwipeEvent;
    if (!track || track.dead || ev.rkSwipeHandled) { track = null; return false; }
    const t = e.changedTouches[0];
    const dx = t.clientX - track.x, dy = t.clientY - track.y;
    const dt = Date.now() - track.t;
    track = null;
    if (dt > MAX_MS || Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return false;
    const fn = dx < 0 ? opts.onLeft : opts.onRight;
    if (!fn) return false;
    if (fn() === false) return false;   // rien à faire à ce niveau : le geste remonte
    ev.rkSwipeHandled = true;
    return true;
  };
  return { start, move, end };
}

/** Gestionnaires React à poser sur la racine d'une page (sections). */
export function useSwipe(opts: SwipeOptions) {
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  const trackerRef = useRef<ReturnType<typeof makeTracker> | null>(null);
  const tracker = () => {
    if (!trackerRef.current) {
      trackerRef.current = makeTracker({
        get onLeft() { return optsRef.current.onLeft; },
        get onRight() { return optsRef.current.onRight; },
        get enabled() { return optsRef.current.enabled; },
      });
    }
    return trackerRef.current;
  };
  const onTouchStart = useCallback((e: React.TouchEvent) => tracker().start(e.nativeEvent), []);
  const onTouchMove  = useCallback((e: React.TouchEvent) => tracker().move(e.nativeEvent), []);
  const onTouchEnd   = useCallback((e: React.TouchEvent) => { tracker().end(e.nativeEvent); }, []);
  return { onTouchStart, onTouchMove, onTouchEnd };
}

/** Écoute au niveau du document (onglets). */
export function useGlobalSwipe(opts: SwipeOptions) {
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  useEffect(() => {
    const tracker = makeTracker({
      get onLeft() { return optsRef.current.onLeft; },
      get onRight() { return optsRef.current.onRight; },
      get enabled() { return optsRef.current.enabled; },
    });
    const passive: AddEventListenerOptions = { passive: true };
    document.addEventListener('touchstart', tracker.start, passive);
    document.addEventListener('touchmove', tracker.move, passive);
    document.addEventListener('touchend', tracker.end, passive);
    document.addEventListener('touchcancel', tracker.end, passive);
    return () => {
      document.removeEventListener('touchstart', tracker.start);
      document.removeEventListener('touchmove', tracker.move);
      document.removeEventListener('touchend', tracker.end);
      document.removeEventListener('touchcancel', tracker.end);
    };
  }, []);
}

/**
 * Passe d'une section à l'autre dans une liste ordonnée.
 * Renvoie false au bord pour laisser le geste remonter aux onglets.
 */
export function stepSection<T>(order: readonly T[], current: T, dir: 1 | -1, set: (v: T) => void): boolean {
  const i = order.indexOf(current);
  const next = order[i + dir];
  if (i < 0 || next === undefined) return false;
  set(next);
  return true;
}
