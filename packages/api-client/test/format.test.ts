import { describe, expect, it } from 'vitest';
import {
  avatarImage, categoryImage, formatDateTime, formatDelta, formatDuration, formatEuros, formatLongDate, formatMonthLong, formatMonthYear,
  formatNumber, formatPercent, formatRelative, formatShortDate, formatSince, initialsOf, plural,
} from '../src';

const S = ' ';
describe('mise en forme', () => {
  it('nombres, euros, pourcentages', () => {
    expect(formatNumber(12480)).toBe(`12${S}480`);
    expect(formatNumber(1.76, 2)).toBe('1,76');
    expect(formatNumber(-5)).toBe('−5');
    expect(formatNumber(null)).toBe('—');
    expect(formatEuros(2212000)).toBe(`22${S}120${S}€`);
    expect(formatEuros(499)).toBe(`4,99${S}€`);
    expect(formatEuros(300, { signed: true })).toBe(`+3${S}€`);
    expect(formatEuros(300, { signed: true, decimals: 'always' })).toBe(`+3,00${S}€`);
    expect(formatEuros(-499, { signed: true })).toBe(`−4,99${S}€`);
    expect(formatEuros(-499)).toBe(`−4,99${S}€`);
    expect(formatEuros(0, { signed: true })).toBe(`0${S}€`);
    expect(formatEuros(null)).toBe('—');
    expect(formatDelta(8.2)).toBe(`+8,2${S}%`);
    expect(formatDelta(-3)).toBe(`−3${S}%`);
    expect(formatDelta(0)).toBe(`0${S}%`);
    expect(formatDelta(null)).toBe('—');
    expect(formatPercent(74.2)).toBe(`74,2${S}%`);
    expect(formatPercent(68)).toBe(`68${S}%`);
    expect(formatPercent(null)).toBe('—');
  });

  it('dates et durées', () => {
    const d = new Date(2026, 8, 24, 16, 42);
    expect(formatShortDate(d)).toBe('24 sept.');
    expect(formatDateTime(d)).toBe('24 sept. 16:42');
    expect(formatLongDate(d)).toBe('24 septembre 2026');
    expect(formatMonthYear(new Date(2026, 2, 3))).toBe('mars 2026');
    expect(formatMonthLong(d)).toBe('Septembre 2026');
    for (const f of [formatShortDate, formatDateTime, formatLongDate, formatMonthYear, formatMonthLong, formatRelative]) expect(f(null)).toBe('—');
    const now = new Date(2026, 8, 24, 12, 0);
    expect(formatRelative(new Date(2026, 8, 24, 11, 59, 40), now)).toBe("À l'instant");
    expect(formatRelative(new Date(2026, 8, 24, 11, 56), now)).toBe('Il y a 4 min');
    expect(formatRelative(new Date(2026, 8, 24, 10, 0), now)).toBe('Il y a 2 h');
    expect(formatRelative(new Date(2026, 8, 23, 10, 0), now)).toBe('Hier');
    expect(formatRelative(new Date(2026, 7, 21, 10, 0), now)).toBe('Il y a 34 j');
    expect(formatSince(new Date(2026, 8, 24, 11, 30), now)).toBe("à l'instant");
    expect(formatSince(new Date(2026, 8, 24, 7, 0), now)).toBe('il y a 5 h');
    expect(formatSince(new Date(2026, 8, 23, 7, 0), now)).toBe('hier');
    expect(formatSince(new Date(2026, 8, 22, 7, 0), now)).toBe('il y a 2 jours');
    expect(formatSince(null)).toBe('');
    expect(formatDuration(11520)).toBe('3 h 12');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(null)).toBe('—');
  });

  it('initiales, pluriels, pictogrammes', () => {
    expect(initialsOf('Camille Rousseau')).toBe('CR');
    expect(initialsOf('Decathlon')).toBe('DE');
    expect(initialsOf(null)).toBe('?');
    expect(plural(1, 'activité')).toBe('1 activité');
    expect(plural(1200, 'activité')).toBe(`1${S}200 activités`);
    expect(categoryImage('sport')).toBe('/assets/categories/track.png');
    expect(categoryImage(null)).toBe('/assets/categories/emoji.png');
    expect(avatarImage(0)).toBe('/assets/avatars/avatar_01.png');
    expect(avatarImage('abc')).toMatch(/avatar_\d{2}\.png$/);
  });
});
