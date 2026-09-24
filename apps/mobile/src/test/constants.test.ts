import { describe, it, expect } from 'vitest';
import {
  APP_NAME, MIN_CHILD_AGE, MAX_CHILD_AGE, FREE_PLAN_LIMITS,
  POINTS_CONFIG, CATEGORY_COLORS,
  DIFFICULTY_CONFIG, ENCOURAGEMENT_MESSAGES, getRandomEncouragement,
} from '../lib/constants';

describe('constants', () => {
  it('has correct app name', () => {
    expect(APP_NAME).toBe('Deconnect');
  });

  it('has valid age limits (7–18 ans)', () => {
    expect(MIN_CHILD_AGE).toBe(7);
    expect(MAX_CHILD_AGE).toBe(18);
    expect(MIN_CHILD_AGE).toBeLessThan(MAX_CHILD_AGE);
  });

  it('has valid free plan limits', () => {
    expect(FREE_PLAN_LIMITS.maxChildren).toBe(1);
    expect(FREE_PLAN_LIMITS.maxCustomActivities).toBeGreaterThan(0);
    expect(FREE_PLAN_LIMITS.maxCustomRewards).toBeGreaterThan(0);
  });

  it('has valid points config', () => {
    expect(POINTS_CONFIG.defaultActivityPoints).toBe(10);
    expect(POINTS_CONFIG.minPoints).toBe(0);
    expect(POINTS_CONFIG.levelThresholds).toHaveLength(10);
    expect(POINTS_CONFIG.levelThresholds[0]).toBe(0);
    // Thresholds should be sorted ascending
    for (let i = 1; i < POINTS_CONFIG.levelThresholds.length; i++) {
      expect(POINTS_CONFIG.levelThresholds[i]).toBeGreaterThan(POINTS_CONFIG.levelThresholds[i - 1]);
    }
  });

  it('has category colors for all expected categories (brief)', () => {
    // Brief categories: sport, créativité, nature, vie quotidienne, social, lecture, famille, cuisine
    const expected = ['sport', 'creativite', 'nature', 'vie-quotidienne', 'social', 'lecture', 'famille'];
    expected.forEach(slug => {
      expect(CATEGORY_COLORS[slug]).toBeDefined();
      expect(CATEGORY_COLORS[slug]).toMatch(/^#/);
    });
  });

  it('has cuisine in category colors (added in brief alignment)', () => {
    expect(CATEGORY_COLORS['cuisine']).toBeDefined();
    expect(CATEGORY_COLORS['cuisine']).toMatch(/^#/);
  });

  it('has valid difficulty config', () => {
    expect(DIFFICULTY_CONFIG.easy).toBeDefined();
    expect(DIFFICULTY_CONFIG.medium).toBeDefined();
    expect(DIFFICULTY_CONFIG.hard).toBeDefined();
    expect(DIFFICULTY_CONFIG.easy.label).toBe('Facile');
    expect(DIFFICULTY_CONFIG.medium.label).toBe('Moyen');
    expect(DIFFICULTY_CONFIG.hard.label).toBe('Difficile');
  });

  it('has encouragement messages', () => {
    expect(ENCOURAGEMENT_MESSAGES.length).toBeGreaterThan(0);
  });

  it('getRandomEncouragement returns a valid message', () => {
    const msg = getRandomEncouragement();
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    expect(ENCOURAGEMENT_MESSAGES).toContain(msg);
  });
});
