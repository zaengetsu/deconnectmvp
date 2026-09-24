import { describe, it, expect } from 'vitest';
import {
  loginSchema, registerSchema, forgotPasswordSchema,
  childSchema, activitySchema, rewardSchema,
  validationSchema, rejectionSchema,
} from '../lib/validations';

describe('loginSchema', () => {
  it('accepts valid input', () => {
    expect(loginSchema.safeParse({ email: 'test@test.com', password: '123456' }).success).toBe(true);
  });
  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: '123456' }).success).toBe(false);
  });
  it('rejects short password', () => {
    expect(loginSchema.safeParse({ email: 'test@test.com', password: '123' }).success).toBe(false);
  });
  it('rejects empty fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = { email: 'a@b.com', password: '123456', confirmPassword: '123456', fullName: 'Jean' };

  it('accepts valid input', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects mismatched passwords', () => {
    expect(registerSchema.safeParse({ ...valid, confirmPassword: 'different' }).success).toBe(false);
  });
  it('rejects short name', () => {
    expect(registerSchema.safeParse({ ...valid, fullName: 'J' }).success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });
  it('rejects invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'bad' }).success).toBe(false);
  });
});

describe('childSchema', () => {
  it('accepts valid child', () => {
    expect(childSchema.safeParse({ display_name: 'Lucas', age: 10 }).success).toBe(true);
  });
  it('accepts minimum age (7 — brief target)', () => {
    expect(childSchema.safeParse({ display_name: 'Lucas', age: 7 }).success).toBe(true);
  });
  it('accepts maximum age (18)', () => {
    expect(childSchema.safeParse({ display_name: 'Lucas', age: 18 }).success).toBe(true);
  });
  it('rejects age below 7', () => {
    expect(childSchema.safeParse({ display_name: 'Lucas', age: 6 }).success).toBe(false);
  });
  it('rejects age above 18', () => {
    expect(childSchema.safeParse({ display_name: 'Lucas', age: 19 }).success).toBe(false);
  });
  it('rejects short name', () => {
    expect(childSchema.safeParse({ display_name: 'L', age: 10 }).success).toBe(false);
  });
  it('rejects long name', () => {
    expect(childSchema.safeParse({ display_name: 'A'.repeat(21), age: 10 }).success).toBe(false);
  });
});

describe('activitySchema', () => {
  const valid = { title: 'Test Activity', points: 10, difficulty: 'easy' as const };

  it('accepts valid activity', () => {
    expect(activitySchema.safeParse(valid).success).toBe(true);
  });
  it('rejects 0 points', () => {
    expect(activitySchema.safeParse({ ...valid, points: 0 }).success).toBe(false);
  });
  it('rejects points > 100', () => {
    expect(activitySchema.safeParse({ ...valid, points: 101 }).success).toBe(false);
  });
  it('rejects invalid difficulty', () => {
    expect(activitySchema.safeParse({ ...valid, difficulty: 'extreme' }).success).toBe(false);
  });
  it('rejects short title', () => {
    expect(activitySchema.safeParse({ ...valid, title: 'AB' }).success).toBe(false);
  });
});

describe('rewardSchema', () => {
  it('accepts valid reward', () => {
    expect(rewardSchema.safeParse({ title: 'Reward', required_points: 50 }).success).toBe(true);
  });
  it('rejects points < 10', () => {
    expect(rewardSchema.safeParse({ title: 'Reward', required_points: 5 }).success).toBe(false);
  });
  it('rejects points > 1000', () => {
    expect(rewardSchema.safeParse({ title: 'Reward', required_points: 1001 }).success).toBe(false);
  });
});

describe('validationSchema', () => {
  it('accepts empty', () => {
    expect(validationSchema.safeParse({}).success).toBe(true);
  });
  it('accepts with note', () => {
    expect(validationSchema.safeParse({ parent_note: 'Bravo' }).success).toBe(true);
  });
  it('rejects too long note', () => {
    expect(validationSchema.safeParse({ parent_note: 'A'.repeat(201) }).success).toBe(false);
  });
});

describe('rejectionSchema', () => {
  it('accepts valid reason', () => {
    expect(rejectionSchema.safeParse({ rejection_reason: 'Not done' }).success).toBe(true);
  });
  it('rejects short reason', () => {
    expect(rejectionSchema.safeParse({ rejection_reason: 'No' }).success).toBe(false);
  });
});
