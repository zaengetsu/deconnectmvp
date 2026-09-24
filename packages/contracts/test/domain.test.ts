import { describe, expect, it } from 'vitest';
import {
  ageFits, ageTone, canTransitionOffer, higherPriority, levelForPoints, offerIssues, pointsToNextLevel,
  CreateOfferInput, RegisterInput, UpdatePreferencesInput, LoginInput, ChildLinkInput,
} from '../src';

describe('ageTone', () => {
  it.each([[null, 'kid'], [undefined, 'kid'], [5, 'young'], [7, 'young'], [8, 'kid'], [12, 'kid'], [13, 'teen'], [17, 'teen']])(
    'âge %s → %s', (age, tone) => expect(ageTone(age as number | null)).toBe(tone));
});

describe('ageFits', () => {
  it('respecte les bornes inclusives et optionnelles', () => {
    expect(ageFits(9, 9, 14)).toBe(true);
    expect(ageFits(14, 9, 14)).toBe(true);
    expect(ageFits(8, 9, 14)).toBe(false);
    expect(ageFits(15, 9, 14)).toBe(false);
    expect(ageFits(4, null, null)).toBe(true);
  });
});

describe('niveaux', () => {
  it.each([[0, 1], [49, 1], [50, 2], [149, 2], [150, 3], [3499, 9], [3500, 10], [99999, 10]])('%i points → niveau %i', (p, l) =>
    expect(levelForPoints(p)).toBe(l));
  it('points jusqu’au niveau suivant', () => {
    expect(pointsToNextLevel(0)).toBe(50);
    expect(pointsToNextLevel(120)).toBe(30);
    expect(pointsToNextLevel(3500)).toBeNull();
  });
});

describe('priorités', () => {
  it('garde la plus importante', () => {
    expect(higherPriority('low', 'high')).toBe('high');
    expect(higherPriority('critical', 'normal')).toBe('critical');
    expect(higherPriority('normal', 'normal')).toBe('normal');
  });
});

describe('cycle de vie des offres', () => {
  it('ne publie que depuis la relecture', () => {
    expect(canTransitionOffer('draft', 'published')).toBe(false);
    expect(canTransitionOffer('draft', 'pending_review')).toBe(true);
    expect(canTransitionOffer('pending_review', 'published')).toBe(true);
    expect(canTransitionOffer('paused', 'published')).toBe(true);
    expect(canTransitionOffer('expired', 'published')).toBe(false);
  });
});

describe('offerIssues', () => {
  it('accepte une offre cohérente', () => {
    expect(offerIssues({ kind: 'child_reward', requiredPoints: 300, minAge: 6, maxAge: 12 })).toEqual([]);
  });
  it('liste toutes les incohérences', () => {
    const issues = offerIssues({
      kind: 'parent_voucher', triggerType: 'none', minAge: 12, maxAge: 8, codeMode: 'generic',
      startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-01T00:00:00Z',
    });
    expect(issues).toHaveLength(4);
  });
  it('exige les cibles des déclencheurs et les points', () => {
    expect(offerIssues({ kind: 'child_reward' })).toContain('Une récompense enfant demande un nombre de points');
    expect(offerIssues({ kind: 'sponsored_activity', triggerType: 'activity_validated' })).toContain("Choisissez l'activité déclencheuse");
    expect(offerIssues({ kind: 'sponsored_activity', triggerType: 'category_validated' })).toContain('Choisissez la catégorie déclencheuse');
  });
});

describe('schémas zod', () => {
  it('normalise l’email', () => {
    expect(RegisterInput.parse({ email: ' Emma@Ex.FR ', password: 'motdepasse', fullName: 'Emma' }).email).toBe('emma@ex.fr');
    expect(LoginInput.safeParse({ email: 'pas-un-email', password: 'x' }).success).toBe(false);
  });
  it('refuse un PIN invalide', () => {
    expect(ChildLinkInput.safeParse({ code: 'ABC234', pin: '12a4' }).success).toBe(false);
    expect(ChildLinkInput.safeParse({ code: 'ABC234', pin: '1234' }).success).toBe(true);
  });
  it('applique les règles d’offre à la création', () => {
    const r = CreateOfferInput.safeParse({ kind: 'child_reward', title: 'Gourde' });
    expect(r.success).toBe(false);
    const ok = CreateOfferInput.parse({ kind: 'child_reward', title: 'Gourde', requiredPoints: 300 });
    expect(ok.minAge).toBe(3);
  });
  it('valide les heures silencieuses', () => {
    expect(UpdatePreferencesInput.safeParse({ quietHoursStart: '21:00' }).success).toBe(true);
    expect(UpdatePreferencesInput.safeParse({ quietHoursStart: '25:00' }).success).toBe(false);
  });
});
