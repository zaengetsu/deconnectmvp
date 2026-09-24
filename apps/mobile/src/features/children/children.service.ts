import { api } from '../../lib/api';
import { snake } from '../../lib/case';
import type { Child, ChildInsert, ChildUpdate } from '../../types/database.types';

/** Les dates « jour » arrivent en ISO complet : l'app attend AAAA-MM-JJ (calcul de série). */
export function toChild(raw: unknown): Child {
  const c = snake<Child>(raw);
  return { ...c, last_activity_date: c.last_activity_date ? String(c.last_activity_date).slice(0, 10) : null };
}

export const childrenService = {
  /** Enfants actifs du parent connecté (le paramètre est gardé pour la compatibilité des écrans). */
  async getChildren(_parentId?: string): Promise<Child[]> {
    const rows = await api<unknown[]>('GET', '/v1/children');
    return rows.map(toChild);
  },

  async getChild(childId: string): Promise<Child> {
    return toChild(await api('GET', `/v1/children/${childId}`));
  },

  async createChild(child: ChildInsert): Promise<Child> {
    return toChild(
      await api('POST', '/v1/children', {
        displayName: child.display_name,
        age: child.age,
        ...(child.avatar_url ? { avatarUrl: child.avatar_url } : {}),
      }),
    );
  },

  async updateChild(childId: string, updates: ChildUpdate): Promise<Child> {
    const body: Record<string, unknown> = {};
    if (updates.display_name !== undefined) body.displayName = updates.display_name;
    if (updates.age !== undefined) body.age = updates.age;
    if (updates.avatar_url) body.avatarUrl = updates.avatar_url;
    return toChild(await api('PATCH', `/v1/children/${childId}`, body));
  },

  async deactivateChild(childId: string): Promise<void> {
    await api('DELETE', `/v1/children/${childId}`);
  },

  /** QR + code court pour relier l'appareil de l'enfant (15 min). */
  async createLinkCode(childId: string): Promise<{ token: string; code: string; expiresAt: string }> {
    return api('POST', `/v1/children/${childId}/link-code`);
  },
};
