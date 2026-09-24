import { loadEnv } from '../../src/config/env';
import { familyName } from '../../src/modules/billing/billing-admin.service';
import { categoryOf, CATEGORY_TYPES, nextSendTime, type PreferenceFlags, resolveChannels, typeAllowed } from '../../src/modules/notifications/policy';
import {
  describeCondition,
  describeScope,
  describeStockPeriod,
  displayStatus,
  distanceKm,
  isOfferLive,
  maskCount,
  normalizeCodes,
  normalizeRk,
  rkCode,
  roundTen,
  slugify,
  stockLeft,
  type DescribableOffer,
} from '../../src/modules/partners/offer-rules';
import { friendshipStatus } from '../../src/modules/social/social.service';
import { Clock, FixedClock } from '../../src/platform/clock';
import { hashSecret, isLegacyHash, normalizeShortCode, randomHex, randomToken, safeEqual, sha256, shortCode, verifySecret } from '../../src/platform/crypto';
import { lockKey } from '../../src/platform/events/job-lock';
import { backoffSeconds } from '../../src/platform/events/outbox-relay';
import {
  addDays,
  dateColumnToIso,
  hhmmToMinutes,
  hhmmToTimeColumn,
  isoToDateColumn,
  isoWeekKey,
  isValidTimeZone,
  localDateString,
  timeColumnToHhmm,
  weekStart,
  zonedParts,
  zonedTimeToUtc,
} from '../../src/platform/time';

const prefs = (over: Partial<PreferenceFlags> = {}): PreferenceFlags => ({
  pushEnabled: true,
  emailEnabled: true,
  inAppEnabled: true,
  activityCompleted: true,
  activityValidation: true,
  activityPlanned: true,
  rewardUnlocked: true,
  rewardPending: true,
  familyActivities: true,
  familyInvitations: true,
  goals: true,
  dailySummary: false,
  weeklySummary: true,
  screenTimeGoal: true,
  screenTimeSummary: false,
  tips: true,
  productNews: false,
  quietHoursStart: hhmmToTimeColumn('20:30'),
  quietHoursEnd: hhmmToTimeColumn('07:30'),
  timezone: 'Europe/Paris',
  channelOverrides: {},
  ...over,
});

describe('temps et fuseaux', () => {
  it('heure murale ↔ UTC, y compris au passage à l’heure d’hiver', () => {
    expect(zonedTimeToUtc(2026, 9, 24, 19, 0, 'Europe/Paris').toISOString()).toBe('2026-09-24T17:00:00.000Z');
    expect(zonedTimeToUtc(2026, 11, 2, 19, 0, 'Europe/Paris').toISOString()).toBe('2026-11-02T18:00:00.000Z');
    expect(zonedTimeToUtc(2026, 9, 24, 8, 0, 'America/Montreal').toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(zonedParts(new Date('2026-09-23T22:30:00Z'), 'Europe/Paris')).toMatchObject({ day: 24, hour: 0, minute: 30, weekday: 4 });
    expect(localDateString(new Date('2026-09-23T22:30:00Z'), 'Europe/Paris')).toBe('2026-09-24');
    expect(localDateString(new Date('2026-09-23T22:30:00Z'), 'UTC')).toBe('2026-09-23');
  });

  it('dates calendaires, semaines ISO, colonnes Postgres', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // dimanche → lundi précédent
    expect(weekStart('2026-09-21')).toBe('2026-09-21');
    expect(isoWeekKey('2026-09-23')).toBe('2026-W39');
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
    expect(hhmmToMinutes('07:30')).toBe(450);
    expect(timeColumnToHhmm(hhmmToTimeColumn('19:05'))).toBe('19:05');
    expect(timeColumnToHhmm(null)).toBeNull();
    expect(hhmmToTimeColumn(undefined)).toBeNull();
    expect(dateColumnToIso(isoToDateColumn('2026-09-23'))).toBe('2026-09-23');
    expect(dateColumnToIso(null)).toBeNull();
    expect(isValidTimeZone('Europe/Paris')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('horloges', () => {
    expect(new Clock().now()).toBeInstanceOf(Date);
    const c = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    c.advance(1000);
    expect(c.now().toISOString()).toBe('2026-01-01T00:00:01.000Z');
    c.set(new Date('2026-02-01T00:00:00Z'));
    expect(c.now().toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('politique de notification', () => {
  it('préférences par type ; types toujours autorisés', () => {
    expect(typeAllowed(null, 'daily_summary')).toBe(true);
    expect(typeAllowed(prefs(), 'daily_summary')).toBe(false);
    expect(typeAllowed(prefs(), 'weekly_summary')).toBe(true);
    expect(typeAllowed(prefs({ tips: false }), 'tip')).toBe(false);
    expect(typeAllowed(prefs({ activityCompleted: false }), 'level_up')).toBe(true);
  });

  it('canaux : interrupteurs globaux, surcharges par type, critique prioritaire', () => {
    expect(resolveChannels(null, 'activity_completed', ['in_app', 'push'], 'normal')).toEqual(['in_app', 'push']);
    expect(resolveChannels(prefs({ pushEnabled: false }), 'activity_completed', ['in_app', 'push', 'email'], 'normal')).toEqual(['in_app', 'email']);
    expect(resolveChannels(prefs({ channelOverrides: { reward_pending: { push: false, email: false } } }), 'reward_pending', ['in_app', 'push', 'email'], 'high')).toEqual(['in_app']);
    expect(resolveChannels(prefs({ inAppEnabled: false, emailEnabled: false }), 'tip', ['in_app', 'email'], 'low')).toEqual([]);
    expect(resolveChannels(prefs({ pushEnabled: false, emailEnabled: false }), 'billing', ['in_app', 'email'], 'critical')).toEqual(['in_app', 'email']);
  });

  it('heures silencieuses traversant minuit, fuseau du destinataire, critique immédiate', () => {
    const p = prefs();
    expect(nextSendTime(p, 'normal', new Date('2026-09-23T12:00:00Z'))).toBeNull();
    expect(nextSendTime(p, 'normal', new Date('2026-09-23T19:00:00Z'))?.toISOString()).toBe('2026-09-24T05:30:00.000Z'); // 21h → 7h30
    expect(nextSendTime(p, 'normal', new Date('2026-09-24T03:00:00Z'))?.toISOString()).toBe('2026-09-24T05:30:00.000Z'); // 5h → 7h30
    expect(nextSendTime(p, 'critical', new Date('2026-09-23T19:00:00Z'))).toBeNull();
    expect(nextSendTime(null, 'normal', new Date())).toBeNull();
    expect(nextSendTime(prefs({ quietHoursStart: null }), 'normal', new Date('2026-09-23T19:00:00Z'))).toBeNull();
    const day = prefs({ quietHoursStart: hhmmToTimeColumn('13:00'), quietHoursEnd: hhmmToTimeColumn('15:00'), timezone: '' });
    expect(nextSendTime(day, 'low', new Date('2026-09-23T11:30:00Z'))?.toISOString()).toBe('2026-09-23T13:00:00.000Z');
    const tokyo = prefs({ timezone: 'Asia/Tokyo' });
    expect(nextSendTime(tokyo, 'normal', new Date('2026-09-23T13:00:00Z'))?.toISOString()).toBe('2026-09-23T22:30:00.000Z');
  });

  it('catégories du centre de notifications', () => {
    expect(categoryOf('reward_pending', 'high')).toBe('action');
    expect(categoryOf(null)).toBe('other');
    expect(categoryOf('activity_validated')).toBe('activity');
    expect(categoryOf('partner_offer_unlocked')).toBe('reward');
    expect(categoryOf('friend_request')).toBe('family');
    expect(categoryOf('weekly_summary')).toBe('progress');
    expect(categoryOf('billing')).toBe('other');
    expect(CATEGORY_TYPES.activity('activity_reminder')).toBe(true);
    expect(CATEGORY_TYPES.reward('partner_offer_unlocked')).toBe(true);
    expect(CATEGORY_TYPES.family('family_activity')).toBe(true);
    expect(CATEGORY_TYPES.progress('level_up')).toBe(true);
    expect(CATEGORY_TYPES.other('tip')).toBe(true);
  });
});

describe('règles des offres partenaires', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  const base: import('../../src/modules/partners/offer-rules').OfferWindow = { status: 'published', startsAt: null, endsAt: null, stockTotal: null, stockUsed: 0 };
  it('offre active, stock, statut affiché', () => {
    expect(isOfferLive(base, now)).toBe(true);
    expect(isOfferLive({ ...base, status: 'paused' }, now)).toBe(false);
    expect(isOfferLive({ ...base, startsAt: new Date('2026-10-01') }, now)).toBe(false);
    expect(isOfferLive({ ...base, endsAt: now }, now)).toBe(false);
    expect(isOfferLive({ ...base, stockTotal: 2, stockUsed: 2 }, now)).toBe(false);
    expect(stockLeft({ stockTotal: 2, stockUsed: 5 })).toBe(0);
    expect(stockLeft({ stockTotal: null, stockUsed: 5 })).toBeNull();
    const cases: [string, Partial<typeof base>, string][] = [
      ['draft', {}, 'draft'],
      ['pending_brand', {}, 'in_review'],
      ['pending_review', {}, 'in_review'],
      ['changes_requested', {}, 'changes_requested'],
      ['rejected', {}, 'rejected'],
      ['paused', {}, 'paused'],
      ['expired', {}, 'ended'],
      ['published', { startsAt: new Date('2026-10-01') }, 'scheduled'],
      ['published', { stockTotal: 1, stockUsed: 1 } as never, 'ended'],
      ['published', {}, 'active'],
    ];
    for (const [status, over, expected] of cases) expect(displayStatus({ ...base, ...over, status }, now)).toBe(expected);
  });

  it('anonymisation, codes, géographie', () => {
    expect(maskCount(9)).toBeNull();
    expect(maskCount(10)).toBe(10);
    expect(roundTen(24)).toBe(20);
    expect(roundTen(25)).toBe(30);
    expect(normalizeCodes([' ab12 ', 'AB12', 'x', 'cd34'])).toEqual(['AB12', 'CD34']);
    expect(slugify('Décathlon – Lyon Part-Dieu !')).toBe('decathlon-lyon-part-dieu');
    expect(slugify('!!!')).toBe('partenaire');
    for (let i = 0; i < 50; i++) expect(rkCode()).toMatch(/^RK[A-HJ-NP-Z2-9]{2}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeRk('rk4m 82qa')).toBe('RK4M-82QA');
    expect(normalizeRk(' promo10 ')).toBe('PROMO10');
    expect(distanceKm({ lat: 45.7606, lng: 4.8594 }, { lat: 48.8698, lng: 2.3247 })).toBeCloseTo(395, 0);
  });

  it('libellés des cartes d’offre', () => {
    const o: DescribableOffer = { kind: 'parent_voucher', requiredPoints: null, triggerType: 'activity_validated', triggerThreshold: 1, triggerWindowDays: null, targetType: 'national', targetRadiusKm: null, targetPostalCodes: [], stockTotal: null, startsAt: null, endsAt: null };
    expect(describeCondition(o, { activity: 'Vélo' })).toBe('1 fois « Vélo » validée');
    expect(describeCondition({ ...o, triggerThreshold: 3, triggerWindowDays: 7 })).toBe('3 fois « activité » validée en 7 jours');
    expect(describeCondition({ ...o, triggerType: 'category_validated', triggerThreshold: 1 })).toBe('1 activité validée');
    expect(describeCondition({ ...o, triggerType: 'goal_completed' })).toBe('Objectif familial de la semaine atteint');
    expect(describeCondition({ ...o, triggerType: 'level_reached', triggerThreshold: 4 })).toBe('Niveau 4 atteint');
    expect(describeCondition({ ...o, triggerType: 'streak_days', triggerThreshold: 7 })).toBe("Enfant actif 7 jours d'affilée");
    expect(describeCondition({ ...o, triggerType: 'autre' })).toBe('Sans condition');
    expect(describeCondition({ ...o, kind: 'sponsored_activity' })).toBe('Activité sponsorisée ajoutée au catalogue');
    expect(describeCondition({ ...o, kind: 'child_reward', requiredPoints: 1500 })).toBe('Échangeable contre 1 500 points');
    expect(describeScope(o)).toBe('National');
    expect(describeScope({ ...o, targetType: 'radius', targetRadiusKm: null })).toBe('? km autour de votre lieu');
    expect(describeScope({ ...o, targetType: 'area', targetPostalCodes: ['69001', '69002'] })).toBe('69001, 69002');
    expect(describeScope({ ...o, targetType: 'area', targetPostalCodes: ['1', '2', '3', '4'] })).toBe('4 codes postaux');
    expect(describeScope({ ...o, targetType: 'code' }, { code: 'CSE-AIRBUS' })).toBe("Code d'accès CSE-AIRBUS");
    expect(describeStockPeriod(o)).toBe('Stock illimité · sans limite de date');
    expect(describeStockPeriod({ ...o, stockTotal: 3000, endsAt: new Date('2026-12-31') })).toBe("3 000 bons · jusqu'au 31 déc.");
    expect(describeStockPeriod({ ...o, kind: 'child_reward', stockTotal: 40, startsAt: new Date('2026-10-01') })).toBe('40 places · dès le 1 oct.');
  });
});

describe('divers', () => {
  it('cryptographie', async () => {
    expect(sha256('a')).toHaveLength(64);
    expect(randomToken(16)).toHaveLength(22);
    expect(randomHex(4)).toMatch(/^[0-9a-f]{8}$/);
    expect(shortCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(normalizeShortCode(' ab-12 c ')).toBe('AB12C');
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    const hash = await hashSecret('1234');
    expect(await verifySecret(hash, '1234')).toBe(true);
    expect(await verifySecret(hash, '0000')).toBe(false);
    expect(await verifySecret(null, '1234')).toBe(false);
    expect(await verifySecret('pas-un-hash', '1234')).toBe(false);
    const legacy = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4nq5T1dXkQ9rX6sR0n6mY0xq2sWm';
    expect(isLegacyHash(legacy)).toBe(true);
    expect(await verifySecret(legacy, 'mauvais')).toBe(false);
  });

  it('configuration : erreurs lisibles, valeurs par défaut', () => {
    expect(() => loadEnv({})).toThrow(/Configuration invalide/);
    const env = loadEnv({ DATABASE_URL: 'postgresql://x@localhost/db', JWT_ACCESS_SECRET: 'x'.repeat(32) });
    expect(env).toMatchObject({ NOTIFICATIONS_ENGINE: 'api', RUN_JOBS: true, MOBILE_APP_URL: 'rekonect://' });
  });

  it('outbox : backoff plafonné ; clés de verrou stables ; statut d’amitié ; nom de famille', () => {
    expect([1, 2, 3, 20].map(backoffSeconds)).toEqual([5, 10, 20, 3600]);
    expect(lockKey('a')).toBe(lockKey('a'));
    expect(lockKey('a')).not.toBe(lockKey('b'));
    expect(friendshipStatus('pending', true, true)).toBe('approved');
    expect(friendshipStatus('pending', true, false)).toBe('pending');
    expect(friendshipStatus('declined', true, true)).toBe('declined');
    expect(familyName('Camille Dupont', 'c@x.fr')).toBe('Famille Dupont');
    expect(familyName('Camille', 'c@x.fr')).toBe('Famille Camille');
    expect(familyName(null, 'jean.martin@x.fr')).toBe('Famille jean.martin');
  });
});
