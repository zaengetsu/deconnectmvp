import { describe, it, expect } from 'vitest';
import { gamificationService } from '../features/gamification/gamification.service';

// ─── Streak logic (pure functions from gamificationService) ──────
// The DB trigger handles persistence; here we test the level/progress
// logic that relates to streak-based XP bonuses in the future.

describe('Streak-related gamification — level progression', () => {
  // After a 7-day streak, a child would have earned ~7*10 = 70 pts → level 2
  it('7-day streak worth of points reaches level 2', () => {
    const level = gamificationService.calculateLevel(70);
    expect(level).toBe(2);
  });

  // After a 30-day streak, ~300 pts → level 4
  it('30-day streak worth of points reaches level 4', () => {
    const level = gamificationService.calculateLevel(300);
    expect(level).toBe(4);
  });

  it('streak progress is correctly reflected in level progress %', () => {
    // 7 days * 10pts = 70pts — between threshold 50 (lvl2) and 150 (lvl3)
    const progress = gamificationService.getLevelProgress(70);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it('breaking a streak resets to level 1 base progress (0 pts)', () => {
    const progress = gamificationService.getLevelProgress(0);
    expect(progress).toBe(0);
  });
});
