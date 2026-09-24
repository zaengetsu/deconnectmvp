import { api, withQuery } from '../../lib/api';
import { compact, snake } from '../../lib/case';
import type { Reward, RewardRequest } from '../../types/database.types';
import type { RewardFormData } from '../../lib/validations';

function rewardBody(f: Partial<RewardFormData>) {
  return compact({
    title: f.title,
    description: f.description || undefined,
    requiredPoints: f.required_points,
    childId: f.child_id || undefined,
  });
}

const toRewards = (rows: unknown) => snake<Reward[]>(rows);
const toRequests = (rows: unknown) => snake<RewardRequest[]>(rows);

export const rewardsService = {
  // ─── Récompenses ─────────────────────────────────────────
  /**
   * Récompenses actives. Côté parent : toutes, ou celles d'un enfant (+ communes).
   * Côté enfant, la session suffit : le serveur renvoie les siennes.
   */
  async getRewards(_parentId?: string, childId?: string): Promise<Reward[]> {
    return toRewards(await api('GET', withQuery('/v1/rewards', { childId })));
  },

  async getChildRewards(_parentId: string | undefined, childId: string): Promise<Reward[]> {
    return rewardsService.getRewards(undefined, childId);
  },

  async createReward(_parentId: string, formData: RewardFormData): Promise<Reward> {
    return snake<Reward>(await api('POST', '/v1/rewards', rewardBody(formData)));
  },

  async updateReward(rewardId: string, updates: Partial<RewardFormData>): Promise<Reward> {
    return snake<Reward>(await api('PATCH', `/v1/rewards/${rewardId}`, rewardBody(updates)));
  },

  /** Désactivation (l'historique des demandes est conservé). Le serveur vérifie le propriétaire. */
  async deleteReward(rewardId: string): Promise<void> {
    await api('DELETE', `/v1/rewards/${rewardId}`);
  },

  // ─── Catalogue ───────────────────────────────────────────
  async getCatalogRewards(): Promise<Reward[]> {
    const rows = toRewards(await api('GET', '/v1/rewards/catalog'));
    return rows.sort((a, b) => (a.reward_category ?? '').localeCompare(b.reward_category ?? '') || a.required_points - b.required_points);
  },

  /** Copie une récompense du catalogue dans la liste du parent. */
  async activateCatalogReward(_parentId: string, catalogReward: Reward, childId?: string): Promise<Reward> {
    return snake<Reward>(await api('POST', `/v1/rewards/catalog/${catalogReward.id}/activate`, compact({ childId })));
  },

  // ─── Demandes ────────────────────────────────────────────
  /** Demande de l'enfant connecté. */
  async requestReward(_childId: string, rewardId: string): Promise<RewardRequest> {
    return snake<RewardRequest>(await api('POST', `/v1/rewards/${rewardId}/request`));
  },

  async getChildRewardRequests(childId: string): Promise<RewardRequest[]> {
    return toRequests(await api('GET', withQuery('/v1/reward-requests', { childId })));
  },

  async getPendingRewardRequests(_parentId?: string): Promise<RewardRequest[]> {
    const rows = toRequests(await api('GET', withQuery('/v1/reward-requests', { status: 'pending' })));
    return rows.sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));
  },

  /** Approbation : débit des points (et code partenaire éventuel) côté serveur. */
  async approveRewardRequest(requestId: string, _parentId?: string, parentNote?: string): Promise<void> {
    await api('POST', `/v1/reward-requests/${requestId}/approve`, compact({ note: parentNote || undefined }));
  },

  async rejectRewardRequest(requestId: string, _parentId?: string, parentNote?: string): Promise<void> {
    await api('POST', `/v1/reward-requests/${requestId}/reject`, compact({ note: parentNote || undefined }));
  },

  /** La récompense a été remise à l'enfant. */
  async deliverRewardRequest(requestId: string): Promise<void> {
    await api('POST', `/v1/reward-requests/${requestId}/deliver`);
  },
};
