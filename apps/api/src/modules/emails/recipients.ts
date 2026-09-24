// Destinataires des emails automatiques et petits formats d'affichage.
import type { EmailCategory } from '../../platform/mail/catalog';
import type { PrismaService, Tx } from '../../platform/prisma/prisma.service';

type Db = Tx | PrismaService;

export interface Contact {
  id: string | null;
  email: string;
  name: string | null;
}

export interface ParentContact extends Contact {
  id: string;
  emailEnabled: boolean;
  weeklySummary: boolean;
  tips: boolean;
}

/** Parent : compte API ou, pendant la migration, profil Supabase. */
export async function parentContact(db: Db, parentId: string): Promise<ParentContact | null> {
  const [user, profile, prefs] = await Promise.all([
    db.user.findUnique({ where: { id: parentId }, select: { email: true, fullName: true, disabledAt: true } }),
    db.profile.findUnique({ where: { id: parentId }, select: { email: true, fullName: true } }),
    db.notificationPreference.findFirst({ where: { parentId, childId: null }, select: { emailEnabled: true, weeklySummary: true, tips: true } }),
  ]);
  if (user?.disabledAt) return null;
  const email = user?.email ?? profile?.email;
  if (!email) return null;
  return {
    id: parentId,
    email,
    name: user?.fullName ?? profile?.fullName ?? null,
    emailEnabled: prefs?.emailEnabled ?? true,
    weeklySummary: prefs?.weeklySummary ?? true,
    tips: prefs?.tips ?? true,
  };
}

/** Emails « de service » : sécurité, compte, facturation. Les autres respectent le canal email du parent. */
export function parentAccepts(c: ParentContact, category: EmailCategory): boolean {
  if (category === 'security' || category === 'account' || category === 'billing') return true;
  if (!c.emailEnabled) return false;
  if (category === 'reports') return c.weeklySummary;
  if (category === 'tips') return c.tips;
  return true;
}

/** Membres actifs d'un compte partenaire, filtrés par rôle. */
export async function partnerContacts(db: Db, partnerId: string, roles: string[] = ['owner', 'editor']): Promise<Contact[]> {
  const members = await db.partnerMember.findMany({
    where: { partnerId, status: 'active', role: { in: roles } },
    select: { userId: true, email: true, user: { select: { fullName: true, disabledAt: true } } },
  });
  return members.filter((m) => !m.user?.disabledAt).map((m) => ({ id: m.userId, email: m.email, name: m.user?.fullName ?? null }));
}

/** Équipe Rekonect (comptes admin actifs). */
export async function adminContacts(db: Db): Promise<Contact[]> {
  const admins = await db.user.findMany({ where: { role: 'admin', disabledAt: null }, select: { id: true, email: true, fullName: true } });
  return admins.map((a) => ({ id: a.id, email: a.email, name: a.fullName }));
}

const TZ = 'Europe/Paris';

export function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: TZ }).format(d);
}

export function longDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d);
}

export function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: TZ }).format(d);
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export function percentLabel(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '—';
}

/** « il y a 2 jours », « hier » : pour les rappels. */
export function sinceLabel(from: Date, now: Date): string {
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000);
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}
