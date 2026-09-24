import type { PrismaService, Tx } from './prisma/prisma.service';

export const DEFAULT_TIMEZONE = 'Europe/Paris';

/** Fuseau d'une famille : celui des préférences du parent, sinon Europe/Paris. */
export async function familyTimeZone(db: Tx | PrismaService, parentId: string): Promise<string> {
  const prefs = await db.notificationPreference.findFirst({
    where: { parentId, childId: null },
    select: { timezone: true },
  });
  return prefs?.timezone ?? DEFAULT_TIMEZONE;
}
