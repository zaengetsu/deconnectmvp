// Libellés et couleurs du portail partenaires (maquette Partenaire).
import type { DisplayStatus, OfferKind, PartnerDetail } from '@rekonect/api-client';

export const OFFER_STATUS: Record<DisplayStatus, [string, string]> = {
  active: ['#E9F1EC', '#4A7A5F'],
  scheduled: ['#EEEFFB', '#3C41A8'],
  in_review: ['#FBF0DA', '#96681A'],
  changes_requested: ['#FBF0DA', '#96681A'],
  ended: ['#F1EEE9', '#8A8FA6'],
  paused: ['#F1EEE9', '#4A4E66'],
  draft: ['#F1EEE9', '#4A4E66'],
  rejected: ['#FBE9EC', '#AE3A50'],
};

export const REDEMPTION_STATUS: Record<string, [string, string]> = {
  redeemed: ['#E9F1EC', '#4A7A5F'],
  unlocked: ['#EEEFFB', '#3C41A8'],
  expired: ['#F1EEE9', '#8A8FA6'],
  cancelled: ['#F1EEE9', '#8A8FA6'],
};

export const KIND_BG: Record<OfferKind, string> = { child_reward: '#FF9469', parent_voucher: '#3C41A8', sponsored_activity: '#5CB88F' };

export const ROLE_LABELS: Record<string, string> = { owner: 'admin', editor: 'édition', viewer: 'lecture', reception: 'validation des bons uniquement' };

/** Titres de la page Lieux selon le type de compte (maquette : Magasins / Mon magasin / Équipements / Sites). */
export function placesCopy(d: PartnerDetail | null) {
  const kind = d?.kind ?? 'brand';
  if (kind === 'brand') return { title: 'Magasins', sub: (n: number) => `${n} magasin${n > 1 ? 's' : ''} rattaché${n > 1 ? 's' : ''} · chaque directeur peut publier des offres locales` };
  if (kind === 'store') return { title: 'Mon magasin', sub: () => `Les offres nationales de ${d?.parentPartner?.name ?? 'votre enseigne'} s'affichent automatiquement dans votre zone` };
  if (kind === 'public_institution') return { title: 'Équipements', sub: (n: number) => `${n} équipement${n > 1 ? 's' : ''} où les récompenses sont utilisables` };
  if (kind === 'cse') return { title: 'Sites', sub: () => "L'offre est réservée aux salariés disposant du code d'accès" };
  return { title: 'Lieux', sub: (n: number) => `${n} lieu${n > 1 ? 'x' : ''} où vos bons sont utilisables` };
}

export function placesNote(d: PartnerDetail | null): string {
  const kind = d?.kind ?? 'brand';
  if (kind === 'brand') return "Les offres nationales sont visibles partout. Un magasin peut ajouter ses propres offres dans un rayon de 20 km : elles sont soumises à votre validation avant l'équipe Rekonect.";
  if (kind === 'store') return `En tant que magasin rattaché, vos offres locales sont validées par ${d?.parentPartner?.name ?? 'votre enseigne'} puis par l'équipe Rekonect.`;
  if (kind === 'public_institution') return "Chaque équipement dispose d'un accès « accueil » pour scanner les QR codes. Aucune donnée personnelle n'est visible par les agents.";
  if (kind === 'cse') return "Les familles activent l'offre avec votre code d'accès. Vous ne voyez que des volumes agrégés par site, jamais les familles individuellement.";
  return 'Chaque lieu peut valider les bons présentés en caisse ou à l’accueil. Aucune donnée personnelle des familles n’est visible.';
}

export const ACCESS_LABEL: Record<string, string> = { admin: 'Admin', delegated: 'Délégué', read: 'Lecture', reception: 'Accueil' };
