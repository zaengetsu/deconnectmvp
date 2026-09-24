// Libellés et couleurs du back-office, repris des maquettes.
import type { AdminPartnerRow, CatalogStatus, Difficulty, FamilyStatus } from '@rekonect/api-client';
import { C } from '@rekonect/ui';

export const CATALOG_STATUS: Record<CatalogStatus, { label: string; bg: string; fg: string }> = {
  published: { label: 'Publiée', bg: '#E9F1EC', fg: '#4A7A5F' },
  draft: { label: 'Brouillon', bg: '#F1EEE9', fg: '#4A4E66' },
  flagged: { label: 'Signalée', bg: '#FBF0DA', fg: '#96681A' },
  archived: { label: 'Archivée', bg: '#F1EEE9', fg: '#8A8FA6' },
};

export const DIFFICULTY: Record<Difficulty, { label: string; color: string }> = {
  easy: { label: 'Facile', color: '#4A7A5F' },
  medium: { label: 'Moyen', color: '#96681A' },
  hard: { label: 'Difficile', color: '#AE3A50' },
};

export const REWARD_CATEGORY: Record<string, { label: string; bg: string; fg: string }> = {
  privilege: { label: 'Privilèges', bg: '#EEEFFB', fg: '#3C41A8' },
  family: { label: 'Moments familiaux', bg: '#FBE9EC', fg: '#AE3A50' },
  experience: { label: 'Expériences', bg: '#FFEDE4', fg: '#C2582A' },
  responsibility: { label: 'Responsabilités', bg: '#E9F1EC', fg: '#4A7A5F' },
  symbolic: { label: 'Symboliques', bg: '#FBF0DA', fg: '#96681A' },
};

export const PLAN_BADGE: Record<string, [string, string]> = {
  free: ['#F1EEE9', '#4A4E66'],
  family: ['#EEEFFB', '#3C41A8'],
  family_plus: ['#FFEDE4', '#C2582A'],
};

export const FAMILY_STATUS_COLOR: Record<FamilyStatus, string> = { active: '#4A7A5F', past_due: '#AE3A50', inactive: '#96681A' };

export const PARTNER_STATUS: Record<AdminPartnerRow['status'], { label: string; bg: string; fg: string }> = {
  active: { label: 'Actif', bg: '#E9F1EC', fg: '#4A7A5F' },
  onboarding: { label: 'Intégration', bg: '#EEEFFB', fg: '#3C41A8' },
  trial: { label: 'Essai', bg: '#FBF0DA', fg: '#96681A' },
  suspended: { label: 'Suspendu', bg: '#FBE9EC', fg: '#AE3A50' },
  pending: { label: 'En attente', bg: '#F1EEE9', fg: '#4A4E66' },
};

export const OFFER_KIND_BADGE: Record<string, [string, string]> = {
  parent_voucher: ['#EEEFFB', '#3C41A8'],
  child_reward: ['#FFEDE4', '#C2582A'],
  sponsored_activity: ['#E9F1EC', '#4A7A5F'],
};

export const REPORT_REASONS: Record<string, string> = {
  duplicate: 'doublon probable',
  unclear: 'consigne peu claire',
  unsafe: 'sécurité',
  inappropriate: 'contenu inadapté',
  other: 'autre motif',
};

export const PARTNER_KINDS: { id: string; label: string }[] = [
  { id: 'brand', label: 'Enseigne' },
  { id: 'store', label: 'Magasin' },
  { id: 'retailer', label: 'Commerce' },
  { id: 'local_business', label: 'Commerce local' },
  { id: 'association', label: 'Association / club' },
  { id: 'public_institution', label: 'Collectivité' },
  { id: 'cse', label: 'CSE' },
];

/** Couleur de pastille des événements d'abonnement. */
export const EVENT_COLOR: Record<string, string> = {
  created: C.primary,
  upgraded: C.coral,
  downgraded: C.muted,
  canceled: C.muted,
  cancel_scheduled: C.muted,
  reactivated: C.primary,
  renewed: C.primary,
  payment_succeeded: C.green,
  payment_failed: C.red,
  licenses_purchased: '#7C6BD4',
  comp_granted: '#5CB88F',
  trial_started: '#5CB88F',
};

export const PLAN_DOT: Record<string, string> = { free: '#D9DAF3', family: '#3C41A8', family_plus: '#FF9469' };

export function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** « Famille Dupont » + « Marie Dupont » → « DM » (maquette). */
export function familyInitials(lastName: string, parentName: string) {
  return `${lastName[0] ?? ''}${parentName.split(/\s+/)[0]?.[0] ?? ''}`.toUpperCase() || '?';
}
