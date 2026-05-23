import { describe, it, expect } from 'vitest';
import { gamificationService } from '../features/gamification/gamification.service';

describe('gamificationService.calculateLevel', () => {
  it('returns level 1 for 0 points', () => {
    expect(gamificationService.calculateLevel(0)).toBe(1);
  });
  it('returns level 2 for 50 points', () => {
    expect(gamificationService.calculateLevel(50)).toBe(2);
  });
  it('returns level 3 for 150 points', () => {
    expect(gamificationService.calculateLevel(150)).toBe(3);
  });
  it('returns level 4 for 300 points', () => {
    expect(gamificationService.calculateLevel(300)).toBe(4);
  });
  it('returns correct level for 499 points', () => {
    expect(gamificationService.calculateLevel(499)).toBe(4);
  });
  it('returns level 5 for 500 points', () => {
    expect(gamificationService.calculateLevel(500)).toBe(5);
  });
  it('handles very large points', () => {
    expect(gamificationService.calculateLevel(99999)).toBe(10);
  });
});

describe('gamificationService.getNextLevelThreshold', () => {
  it('returns 50 for 0 points', () => {
    expect(gamificationService.getNextLevelThreshold(0)).toBe(50);
  });
  it('returns 150 for 50 points', () => {
    expect(gamificationService.getNextLevelThreshold(50)).toBe(150);
  });
  it('returns 150 for 100 points', () => {
    expect(gamificationService.getNextLevelThreshold(100)).toBe(150);
  });
});

describe('gamificationService.getLevelProgress', () => {
  it('returns 0 for 0 points', () => {
    expect(gamificationService.getLevelProgress(0)).toBe(0);
  });
  it('returns 50 for 25 points (halfway to level 2)', () => {
    expect(gamificationService.getLevelProgress(25)).toBe(50);
  });
  it('returns 100 for max level', () => {
    expect(gamificationService.getLevelProgress(99999)).toBe(100);
  });
  it('returns correct progress mid-level', () => {
    const progress = gamificationService.getLevelProgress(100); // between 50 and 150
    expect(progress).toBe(50);
  });
});
