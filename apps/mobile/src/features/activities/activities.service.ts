import { api, withQuery } from '../../lib/api';
import { compact, snake } from '../../lib/case';
import type { Activity, ActivityCategory, ChildActivity } from '../../types/database.types';
import type { ActivityFormData } from '../../lib/validations';

/** Formulaire de l'app (snake_case) → corps attendu par l'API. Les champs vides sont omis. */
function activityBody(f: Partial<ActivityFormData>) {
  return compact({
    title: f.title,
    description: f.description || undefined,
    instructions: f.instructions || undefined,
    points: f.points,
    durationMinutes: f.duration_minutes || undefined,
    difficulty: f.difficulty,
    categoryId: f.category_id || undefined,
  });
}

const toActivities = (rows: unknown) => snake<Activity[]>(rows);
const toChildActivities = (rows: unknown) => snake<ChildActivity[]>(rows);

export const activitiesService = {
  // ─── Catégories ──────────────────────────────────────────
  async getCategories(): Promise<ActivityCategory[]> {
    return snake<ActivityCategory[]>(await api('GET', '/v1/activity-categories'));
  },

  // ─── Activités ───────────────────────────────────────────
  /** Catalogue visible par le parent (Rekonect, activités perso, partenaires consentis). */
  async getActivities(filters?: { category_id?: string; difficulty?: string; min_age?: number; max_age?: number }): Promise<Activity[]> {
    const rows = toActivities(await api('GET', withQuery('/v1/activities', { categoryId: filters?.category_id })));
    return rows.filter(
      (a) =>
        (!filters?.difficulty || a.difficulty === filters.difficulty) &&
        (filters?.min_age == null || a.min_age == null || a.min_age <= filters.min_age) &&
        (filters?.max_age == null || a.max_age == null || a.max_age >= filters.max_age),
    );
  },

  async getActivity(activityId: string): Promise<Activity> {
    return snake<Activity>(await api('GET', `/v1/activities/${activityId}`));
  },

  async createCustomActivity(_parentId: string, formData: ActivityFormData): Promise<Activity> {
    return snake<Activity>(await api('POST', '/v1/activities', activityBody(formData)));
  },

  async getParentCustomActivities(_parentId?: string): Promise<Activity[]> {
    const rows = toActivities(await api('GET', withQuery('/v1/activities', { origin: 'custom' })));
    return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  },

  async updateActivity(activityId: string, updates: Partial<ActivityFormData>): Promise<Activity> {
    return snake<Activity>(await api('PATCH', `/v1/activities/${activityId}`, activityBody(updates)));
  },

  async deleteActivity(activityId: string): Promise<void> {
    await api('PATCH', `/v1/activities/${activityId}`, { isActive: false });
  },

  // ─── Activités d'un enfant ───────────────────────────────
  async getChildActivities(childId: string, status?: string): Promise<ChildActivity[]> {
    return toChildActivities(await api('GET', withQuery(`/v1/children/${childId}/activities`, { status })));
  },

  /** L'enfant choisit une activité du catalogue. */
  async selectActivity(_childId: string, activityId: string): Promise<ChildActivity> {
    return snake<ChildActivity>(await api('POST', '/v1/child-activities', { activityId }));
  },

  /** L'enfant commence une activité proposée par son parent. */
  async startAssignedActivity(childActivityId: string): Promise<ChildActivity> {
    return snake<ChildActivity>(await api('POST', `/v1/child-activities/${childActivityId}/start`));
  },

  async submitActivity(childActivityId: string, childNote?: string, proofUrl?: string, proofType?: string): Promise<ChildActivity> {
    const type = proofType === 'video' ? 'video' : proofUrl ? 'photo' : childNote ? 'text' : undefined;
    return snake<ChildActivity>(
      await api('POST', `/v1/child-activities/${childActivityId}/submit`, compact({ note: childNote || undefined, proofUrl, proofType: type })),
    );
  },

  async abandonActivity(childActivityId: string): Promise<void> {
    await api('POST', `/v1/child-activities/${childActivityId}/abandon`);
  },

  /** Activités terminées qui attendent la validation du parent connecté. */
  async getPendingValidations(_parentId?: string): Promise<ChildActivity[]> {
    return toChildActivities(await api('GET', '/v1/validations'));
  },

  /** Validation : points, niveau, badges et série sont calculés par le serveur. */
  async validateActivity(childActivityId: string, _parentId?: string, parentNote?: string): Promise<void> {
    await api('POST', `/v1/child-activities/${childActivityId}/validate`, compact({ note: parentNote || undefined }));
  },

  async rejectActivity(childActivityId: string, _parentId: string | undefined, rejectionReason: string): Promise<void> {
    await api('POST', `/v1/child-activities/${childActivityId}/reject`, compact({ reason: rejectionReason || undefined }));
  },

  // ─── Défis du jour ───────────────────────────────────────
  async getDailyChallenges(childId: string): Promise<Activity[]> {
    return toActivities(await api('GET', `/v1/children/${childId}/daily-challenges`));
  },

  // ─── Assignation par le parent ───────────────────────────
  /**
   * Une activité est assignable autant de fois que le parent le souhaite : chaque
   * assignation est une ligne distincte, jamais bloquée par une précédente.
   */
  async assignActivitiesToChild(childId: string, activityIds: string[]): Promise<void> {
    for (const activityId of activityIds) await api('POST', `/v1/children/${childId}/activities`, { activityId });
  },
};
