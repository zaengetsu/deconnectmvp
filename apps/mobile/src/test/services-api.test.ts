import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { sessionStore } from '../lib/session';
import { snake, camel, compact } from '../lib/case';
import { childrenService } from '../features/children/children.service';
import { activitiesService } from '../features/activities/activities.service';
import { rewardsService } from '../features/rewards/rewards.service';
import { gamificationService } from '../features/gamification/gamification.service';
import { storageService } from '../features/storage/storage.service';
import { json, mockApi, signedInAs } from './http';

beforeEach(async () => {
  sessionStore.__reset();
  localStorage.clear();
  await signedInAs('parent');
});
afterEach(() => vi.unstubAllGlobals());

describe('conversion camelCase ↔ snake_case', () => {
  it('convertit en profondeur, sans toucher aux dictionnaires libres', () => {
    expect(snake({ displayName: 'Léa', activity: { durationMinutes: 10, category: { imageUrl: 'x' } }, data: { rewardId: 'r' }, items: [{ isRead: true }] })).toEqual({
      display_name: 'Léa',
      activity: { duration_minutes: 10, category: { image_url: 'x' } },
      data: { rewardId: 'r' },
      items: [{ is_read: true }],
    });
    expect(camel({ quiet_hours_start: '20:30', push_enabled: true, limits: { max_children: 2 } })).toEqual({ quietHoursStart: '20:30', pushEnabled: true, limits: { max_children: 2 } });
    expect(compact({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
    expect(snake(null)).toBeNull();
    expect(snake(new Date(0))).toEqual(new Date(0));
  });
});

describe('enfants', () => {
  it('liste, fiche, création, mise à jour, archivage et code de liaison', async () => {
    const child = { id: 'c1', parentId: 'parent-1', displayName: 'Emma', age: 9, avatarUrl: '/images/avatars/avatar_03.png', totalPoints: 120, level: 3, streakDays: 2, lastActivityDate: '2026-09-23T00:00:00.000Z', isActive: true, deviceLinkedAt: null };
    const http = mockApi({
      'GET /v1/children': [child],
      'GET /v1/children/c1': child,
      'POST /v1/children': child,
      'PATCH /v1/children/c1': { ...child, avatarUrl: '#FFB86B' },
      'POST /v1/children/c1/link-code': { token: 'a'.repeat(32), code: 'K7M3PQ', expiresAt: '2026-09-24T12:15:00Z' },
    });
    const [emma] = await childrenService.getChildren('parent-1');
    expect(emma).toMatchObject({ display_name: 'Emma', total_points: 120, last_activity_date: '2026-09-23', avatar_url: '/images/avatars/avatar_03.png' });
    expect((await childrenService.getChild('c1')).id).toBe('c1');
    await childrenService.createChild({ parent_id: 'parent-1', display_name: 'Emma', age: 9, avatar_url: '/images/avatars/avatar_03.png' });
    await childrenService.createChild({ parent_id: 'parent-1', display_name: 'Tom', age: 7 });
    expect((await childrenService.updateChild('c1', { avatar_url: '#FFB86B', display_name: 'Emma B.' })).avatar_url).toBe('#FFB86B');
    await childrenService.deactivateChild('c1');
    expect((await childrenService.createLinkCode('c1')).code).toBe('K7M3PQ');
    expect(http.calls.filter((c) => c.method === 'POST' && c.path === '/v1/children').map((c) => c.body)).toEqual([
      { displayName: 'Emma', age: 9, avatarUrl: '/images/avatars/avatar_03.png' },
      { displayName: 'Tom', age: 7 },
    ]);
    expect(http.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ displayName: 'Emma B.', avatarUrl: '#FFB86B' });
    expect(http.list()).toContain('DELETE /v1/children/c1');
  });
});

describe('activités', () => {
  it('catalogue filtré, activités perso, cycle de vie complet', async () => {
    const acts = [
      { id: 'a1', title: 'Vélo', difficulty: 'easy', minAge: 6, maxAge: 12, createdAt: '2026-09-01', category: { id: 'k', name: 'Sport' } },
      { id: 'a2', title: 'Échecs', difficulty: 'hard', minAge: 10, maxAge: 16, createdAt: '2026-09-02' },
    ];
    const http = mockApi({ 'GET /v1/activities': acts, 'GET /v1/validations': [{ id: 'ca1', status: 'submitted', child: { displayName: 'Emma' }, activity: { title: 'Vélo' } }] });
    expect((await activitiesService.getActivities({ difficulty: 'easy' })).map((a) => a.id)).toEqual(['a1']);
    expect((await activitiesService.getActivities({ min_age: 8, max_age: 11 })).map((a) => a.id)).toEqual(['a1']);
    expect((await activitiesService.getActivities())[0].category?.name).toBe('Sport');
    expect((await activitiesService.getParentCustomActivities()).map((a) => a.id)).toEqual(['a2', 'a1']);
    await activitiesService.getCategories();
    await activitiesService.getActivity('a1');
    await activitiesService.createCustomActivity('parent-1', { title: 'Lire', points: 20, difficulty: 'easy', description: '', category_id: '', duration_minutes: 15 });
    await activitiesService.updateActivity('a1', { points: 30 });
    await activitiesService.deleteActivity('a1');
    await activitiesService.getChildActivities('c1', 'submitted');
    await activitiesService.selectActivity('c1', 'a1');
    await activitiesService.startAssignedActivity('ca1');
    await activitiesService.submitActivity('ca1', 'Fini !', 'https://api.test/v1/media/m1', 'image');
    await activitiesService.submitActivity('ca2', undefined, 'https://api.test/v1/media/m2', 'video');
    await activitiesService.submitActivity('ca3', 'Juste un mot');
    await activitiesService.abandonActivity('ca4');
    const pending = await activitiesService.getPendingValidations('parent-1');
    expect(pending[0].child?.display_name).toBe('Emma');
    await activitiesService.validateActivity('ca1', 'parent-1');
    await activitiesService.rejectActivity('ca1', 'parent-1', 'Pas de photo');
    await activitiesService.getDailyChallenges('c1');
    await activitiesService.assignActivitiesToChild('c1', ['a1', 'a2']);
    await activitiesService.assignActivitiesToChild('c1', []);

    expect(http.list()).toEqual(expect.arrayContaining([
      'GET /v1/activities?origin=custom',
      'GET /v1/activity-categories',
      'GET /v1/activities/a1',
      'POST /v1/activities',
      'PATCH /v1/activities/a1',
      'GET /v1/children/c1/activities?status=submitted',
      'POST /v1/child-activities',
      'POST /v1/child-activities/ca1/start',
      'POST /v1/child-activities/ca1/submit',
      'POST /v1/child-activities/ca4/abandon',
      'POST /v1/child-activities/ca1/validate',
      'POST /v1/child-activities/ca1/reject',
      'GET /v1/children/c1/daily-challenges',
    ]));
    const body = (m: string, p: string) => http.calls.filter((c) => c.method === m && c.path === p).map((c) => c.body);
    expect(body('POST', '/v1/activities')[0]).toEqual({ title: 'Lire', points: 20, difficulty: 'easy', durationMinutes: 15 });
    expect(body('PATCH', '/v1/activities/a1')).toEqual([{ points: 30 }, { isActive: false }]);
    expect(body('POST', '/v1/child-activities')[0]).toEqual({ activityId: 'a1' });
    expect(body('POST', '/v1/child-activities/ca1/submit')[0]).toEqual({ note: 'Fini !', proofUrl: 'https://api.test/v1/media/m1', proofType: 'photo' });
    expect(body('POST', '/v1/child-activities/ca2/submit')[0]).toEqual({ proofUrl: 'https://api.test/v1/media/m2', proofType: 'video' });
    expect(body('POST', '/v1/child-activities/ca3/submit')[0]).toEqual({ note: 'Juste un mot', proofType: 'text' });
    expect(body('POST', '/v1/child-activities/ca1/reject')[0]).toEqual({ reason: 'Pas de photo' });
    expect(body('POST', '/v1/children/c1/activities')).toEqual([{ activityId: 'a1' }, { activityId: 'a2' }]);
  });
});

describe('récompenses', () => {
  it('liste, catalogue, demandes et décisions du parent', async () => {
    const http = mockApi({
      'GET /v1/rewards/catalog': [{ id: 'k2', rewardCategory: 'sortie', requiredPoints: 200 }, { id: 'k1', rewardCategory: 'sortie', requiredPoints: 100 }, { id: 'k0', rewardCategory: 'écran', requiredPoints: 50 }],
      'GET /v1/reward-requests': [{ id: 'r2', requestedAt: '2026-09-24' }, { id: 'r1', requestedAt: '2026-09-20', reward: { requiredPoints: 50 }, child: { displayName: 'Emma' } }],
    });
    await rewardsService.getRewards('parent-1');
    await rewardsService.getChildRewards('parent-1', 'c1');
    expect((await rewardsService.getCatalogRewards()).map((r) => r.id)).toEqual(['k0', 'k1', 'k2']);
    await rewardsService.createReward('parent-1', { title: 'Film', required_points: 100, child_id: 'c1' });
    await rewardsService.updateReward('rw1', { required_points: 120, description: '' });
    await rewardsService.deleteReward('rw1');
    await rewardsService.activateCatalogReward('parent-1', { id: 'k1' } as never, 'c1');
    await rewardsService.requestReward('c1', 'rw1');
    await rewardsService.getChildRewardRequests('c1');
    const pending = await rewardsService.getPendingRewardRequests('parent-1');
    expect(pending.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(pending[0].reward?.required_points).toBe(50);
    await rewardsService.approveRewardRequest('r1', 'parent-1');
    await rewardsService.rejectRewardRequest('r2', 'parent-1', 'Pas ce soir');
    await rewardsService.deliverRewardRequest('r1');
    expect(http.list()).toEqual([
      'GET /v1/rewards',
      'GET /v1/rewards?childId=c1',
      'GET /v1/rewards/catalog',
      'POST /v1/rewards',
      'PATCH /v1/rewards/rw1',
      'DELETE /v1/rewards/rw1',
      'POST /v1/rewards/catalog/k1/activate',
      'POST /v1/rewards/rw1/request',
      'GET /v1/reward-requests?childId=c1',
      'GET /v1/reward-requests?status=pending',
      'POST /v1/reward-requests/r1/approve',
      'POST /v1/reward-requests/r2/reject',
      'POST /v1/reward-requests/r1/deliver',
    ]);
    expect(http.calls[3].body).toEqual({ title: 'Film', requiredPoints: 100, childId: 'c1' });
    expect(http.calls[4].body).toEqual({ requiredPoints: 120 });
    expect(http.calls[11].body).toEqual({ note: 'Pas ce soir' });
  });
});

describe('progression', () => {
  it('badges, historique, totaux et semaine jour par jour', async () => {
    const now = new Date();
    mockApi({
      'GET /v1/badges': [{ id: 'b2', name: 'Assidu', conditionValue: 10 }, { id: 'b1', name: 'Premier pas', conditionValue: 1 }],
      'GET /v1/children/c1/progress': {
        badges: [{ id: 'b1', name: 'Premier pas', description: null, icon: null, earnedAt: '2026-09-20T10:00:00Z' }],
        ledger: [{ id: 'l1', points: 40, reason: 'Vélo', source: 'activity_validation', createdAt: '2026-09-20T10:00:00Z' }, { id: 'l2', points: -100, reason: 'Film', source: 'reward_redemption', createdAt: '2026-09-21T10:00:00Z' }],
      },
      'GET /v1/children/c1/stats': { totalEarned: 400, totalSpent: 100, activitiesValidated: 9, since: now.toISOString(), recent: { validated: [{ validatedAt: now.toISOString(), earnedPoints: 40 }, { validatedAt: now.toISOString(), earnedPoints: null }], pointsEarned: 40, badgesEarned: 1 } },
    });
    expect((await gamificationService.getAllBadges()).map((b) => b.id)).toEqual(['b1', 'b2']);
    const badges = await gamificationService.getChildBadges('c1');
    expect(badges[0]).toMatchObject({ badge_id: 'b1', earned_at: '2026-09-20T10:00:00Z', badge: { name: 'Premier pas', condition_value: 1 } });
    expect((await gamificationService.getPointsHistory('c1', 1)).map((l) => [l.points, l.source_type])).toEqual([[40, 'activity_validation']]);
    expect(await gamificationService.getAllTimeStats('c1')).toEqual({ totalEarned: 400, totalSpent: 100, activitiesValidated: 9 });
    expect(await gamificationService.getWeeklyStats('c1')).toEqual({ activitiesCompleted: 2, pointsEarned: 40, badgesEarned: 1 });
    const week = await gamificationService.getWeeklyDayByDay('c1');
    expect(week).toHaveLength(7);
    const today = week.find((d) => d.isToday)!;
    expect(today).toMatchObject({ count: 2, points: 40 });
  });
});

describe('preuves d’activité', () => {
  it('envoi binaire vers l’API, contrôles de type et de taille, retrait', async () => {
    const http = mockApi({ 'POST /v1/child-activities/ca1/proof': { id: 'm1', url: 'https://api.test/v1/media/m1', type: 'image' } });
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'p.jpg', { type: 'image/jpeg' });
    expect(await storageService.uploadActivityProof(photo, 'c1', 'ca1')).toEqual({ url: 'https://api.test/v1/media/m1', path: 'm1', type: 'image', childActivityId: 'ca1' });
    expect(http.calls[0]).toMatchObject({ contentType: 'image/jpeg', body: photo });
    await expect(storageService.uploadActivityProof(new File(['x'], 'a.pdf', { type: 'application/pdf' }), 'c1', 'ca1')).rejects.toThrow('Type de fichier non supporté');
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'v.mp4', { type: 'video/mp4' });
    await expect(storageService.uploadActivityProof(big, 'c1', 'ca1')).rejects.toThrow('trop volumineux');
    await storageService.deleteActivityProof('m1', 'ca1');
    await storageService.deleteActivityProof('m1');
    expect(http.list()).toEqual(['POST /v1/child-activities/ca1/proof', 'DELETE /v1/child-activities/ca1/proof/m1']);
  });

  it('erreur serveur remontée telle quelle', async () => {
    mockApi({ 'POST /v1/child-activities/ca1/proof': json(409, { code: 'PROOF_LOCKED', message: 'Cette activité a déjà été envoyée' }) });
    await expect(storageService.uploadActivityProof(new File(['x'], 'p.png', { type: 'image/png' }), 'c1', 'ca1')).rejects.toThrow('déjà été envoyée');
  });
});
