import type { PartnerLeadKind, Plan } from '@rekonect/api-client';
import { BRAND } from '@rekonect/ui';

/**
 * Contenu éditorial de la landing partenaires. Séparé des composants pour
 * pouvoir être relu et modifié sans toucher à la mise en page.
 */

/**
 * Chiffres clés de la bannière. Vide tant qu'on n'a pas de données réelles :
 * le bloc ne s'affiche pas. Exemple le moment venu :
 *   { value: '12 000', label: 'enfants actifs chaque mois' }
 */
export const HERO_STATS: { value: string; label: string }[] = [];

export const SEGMENTS: { name: string; color: string; round: boolean }[] = [
  { name: 'Enseignes sportives', color: BRAND.ocean, round: true },
  { name: 'Magasins de proximité', color: BRAND.peach, round: false },
  { name: 'Mairies', color: BRAND.mint, round: true },
  { name: "Comités d'entreprise", color: BRAND.berry, round: false },
  { name: 'Librairies', color: BRAND.raspberry, round: true },
  { name: 'Loisirs & culture', color: BRAND.amber, round: false },
];

export const STEPS = [
  { n: '01', color: BRAND.indigo, ring: BRAND.indigo, title: 'Vous créez une offre', text: "Une récompense pour l'enfant, un bon pour les parents ou un défi à votre nom. Vous fixez la condition, la zone et le stock.", tags: ['5 minutes', 'Validée sous 48 h'] },
  { n: '02', color: BRAND.peachText, ring: BRAND.peach, title: "L'enfant la débloque", text: 'Il la voit dans son app et réalise les activités demandées. Ses parents valident chaque étape.', tags: ['Sport, lecture, nature…', 'Contrôlé par les parents'] },
  { n: '03', color: '#4A7A5F', ring: BRAND.sage, title: 'La famille vient chez vous', text: "Le bon s'affiche en QR code. Vous le scannez en caisse et suivez les passages magasin par magasin.", tags: ['QR code', 'Code promo en ligne'] },
];

export type OfferTone = 'coral' | 'indigo' | 'ink';
export const OFFER_TYPES: { tone: OfferTone; chip: string; title: string; text: string; example: string; exampleSub: string; badge: string; tilt: number }[] = [
  { tone: 'coral', chip: "POUR L'ENFANT", title: 'Récompense enfant', text: 'Un objet, une entrée ou un atelier, échangé contre des points ou gagné en relevant un défi.', example: 'Gourde enfant offerte', exampleSub: 'Contre 250 points', badge: '250 pts', tilt: -2 },
  { tone: 'indigo', chip: 'POUR LES PARENTS', title: 'Bon parent', text: "Une réduction débloquée par les efforts de l'enfant. Le parent l'utilise en magasin ou en ligne.", example: '−15 % sur le rayon vélo', exampleSub: 'Après 10 sorties à vélo', badge: 'Bon', tilt: 2 },
  { tone: 'ink', chip: 'DANS LE CATALOGUE', title: 'Défi sponsorisé', text: 'Une activité à votre nom proposée aux familles, avec une récompense à la clé pour ceux qui la terminent.', example: '100 km à vélo en famille', exampleSub: '4 210 familles inscrites', badge: 'Défi', tilt: -1.5 },
];

export type AudienceId = 'ens' | 'col' | 'cse';
export const AUDIENCES: Record<AudienceId, { tab: string; color: string; kicker: string; quote: string; examples: { text: string; scope: string }[]; points: { img: string; title: string; text: string }[] }> = {
  ens: {
    tab: 'Enseignes & magasins', color: BRAND.indigo, kicker: 'ENSEIGNES · MAGASINS',
    quote: 'Un compte national, et chaque magasin ajoute ses offres locales.',
    examples: [{ text: '−15 % rayon vélo après 10 sorties à vélo', scope: 'National' }, { text: 'Atelier « répare ton vélo » offert', scope: 'Magasin · 15 km' }],
    points: [
      { img: '/assets/categories/track.png', title: 'Des familles qui viennent en magasin', text: 'Le bon est utilisable en caisse par QR code. Vous voyez combien de bons sont utilisés et dans quel magasin.' },
      { img: '/assets/categories/calendar.png', title: 'Ciblage par magasin', text: "Chaque directeur publie dans un rayon de 5 à 20 km. Le siège valide et garde la vue d'ensemble." },
      { img: '/assets/categories/family.png', title: 'Une image positive', text: "Votre marque est associée à l'effort de l'enfant et à un moment en famille." },
    ],
  },
  col: {
    tab: 'Collectivités', color: '#4A7A5F', kicker: 'MAIRIES · MÉTROPOLES',
    quote: 'Faites découvrir vos équipements aux familles qui ne les connaissent pas.',
    examples: [{ text: 'Entrée piscine offerte contre 150 points', scope: 'Habitants' }, { text: 'Défi « un livre par semaine »', scope: 'Bibliothèques' }],
    points: [
      { img: '/assets/categories/eco.png', title: 'Piscines, parcs, bibliothèques', text: "Chaque équipement devient un lieu où l'enfant utilise sa récompense." },
      { img: '/assets/categories/books.png', title: 'Accès réservé aux habitants', text: "Ciblage par code postal ou par code d'accès, avec un rapport d'impact annuel." },
      { img: '/assets/categories/family.png', title: 'Abonnements offerts', text: 'Offrez le plan Famille aux foyers selon leur quotient familial.' },
    ],
  },
  cse: {
    tab: "Comités d'entreprise", color: BRAND.berry, kicker: 'CSE · MUTUELLES',
    quote: 'Un avantage salarié utile au quotidien des parents.',
    examples: [{ text: 'Rekonect Famille offert 12 mois', scope: 'Code CSE' }, { text: 'Chèque culture après 30 jours actifs', scope: 'Salariés' }],
    points: [
      { img: '/assets/categories/family.png', title: 'Activation par code', text: "Les salariés activent leur accès avec le code du CSE. Aucune liste de noms n'est échangée." },
      { img: '/assets/categories/watercolor.png', title: 'Vos propres récompenses', text: "Places pour l'arbre de Noël, chèques culture, sorties organisées par le CSE." },
      { img: '/assets/categories/calendar.png', title: 'Licences en volume', text: "Facturation annuelle, suivi de l'usage par site en données agrégées." },
    ],
  },
};

export const TRUST = [
  { title: 'Offres modérées', text: 'Chaque offre est relue avant publication.' },
  { title: 'Données agrégées', text: "Aucun nom, aucune adresse, aucune photo d'enfant." },
  { title: 'Parents décisionnaires', text: 'Ils peuvent masquer les offres partenaires à tout moment.' },
  { title: 'Conforme RGPD', text: 'Données hébergées en France.' },
];

/**
 * Grille affichée si l'API ne répond pas : mêmes valeurs que la migration
 * des plans. Les prix réels viennent de GET /v1/billing/plans (modifiables dans l'admin).
 */
export const FALLBACK_PLANS: Pick<Plan, 'id' | 'name' | 'tagline' | 'tag' | 'monthlyPriceCents' | 'features'>[] = [
  { id: 'partner_local', name: 'Partenaire local', tagline: 'Commerce, club, magasin', tag: null, monthlyPriceCents: 2900, features: ['1 point de vente', '3 offres actives', "Ciblage jusqu'à 20 km", "Statistiques d'échange"] },
  { id: 'partner_network', name: 'Réseau', tagline: 'Enseignes multi-magasins', tag: 'ENSEIGNES', monthlyPriceCents: 29000, features: ['Points de vente illimités', 'Offres illimitées, locales et nationales', 'Défis sponsorisés', 'Accès API et export'] },
  { id: 'partner_public', name: 'Collectivité & CSE', tagline: "Mairies, comités d'entreprise", tag: null, monthlyPriceCents: null, features: ['Accès par code (habitants, salariés)', 'Abonnements Famille offerts en volume', 'Équipements publics comme lieux', "Rapport d'impact annuel"] },
];

/** Présentation de chaque plan : ton de la carte, bouton, type d'organisation présélectionné dans le formulaire. */
export const PLAN_STYLE: Record<string, { featured: boolean; cta: string; kind: PartnerLeadKind }> = {
  partner_local: { featured: false, cta: 'Essayer 30 jours', kind: 'store' },
  partner_network: { featured: true, cta: "Parler à l'équipe", kind: 'brand' },
  partner_public: { featured: false, cta: 'Demander un devis', kind: 'public_institution' },
};

export const FAQ = [
  { q: 'Qui paie la récompense ?', a: "Vous. Rekonect ne prend aucune commission sur les bons : vous choisissez la valeur, la quantité et la durée de l'offre, et l'abonnement couvre la plateforme." },
  { q: 'Est-ce que je vois qui sont les enfants ?', a: 'Non. Vous voyez des volumes par zone et par âge, arrondis. Les zones de moins de 20 familles sont masquées.' },
  { q: 'Combien de temps pour publier une offre ?', a: "Vous la créez en quelques minutes. L'équipe Rekonect la vérifie sous 48 h avant sa mise en ligne." },
  { q: 'Peut-on cibler un seul magasin ?', a: 'Oui. Un compte national peut publier partout, et chaque magasin rattaché peut publier des offres autour de son adresse.' },
  { q: "Et si je n'ai pas de point de vente ?", a: "Utilisez un code promo en ligne ou une présentation à l'accueil. Les CSE utilisent le plus souvent un code d'accès." },
];

export const LEAD_KINDS: { id: PartnerLeadKind; label: string }[] = [
  { id: 'store', label: 'Magasin' },
  { id: 'brand', label: 'Enseigne' },
  { id: 'public_institution', label: 'Collectivité' },
  { id: 'cse', label: 'CSE' },
];
