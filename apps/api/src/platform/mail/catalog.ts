// Catalogue des emails automatiques : un modèle par situation, rédigé côté serveur.
// Règles : les emails complètent le push, ne le dupliquent pas ; un sujet clair ; une seule action principale ;
// jamais culpabilisant pour les familles ; chiffres concrets pour les partenaires.
import type { EmailContent } from './layout';

export type EmailAudience = 'parent' | 'partner' | 'admin' | 'any';

/**
 * Catégories : les trois premières sont des emails de service (impossible de s'en désinscrire),
 * les suivantes respectent la désinscription par lien.
 */
export const EMAIL_CATEGORIES = ['security', 'account', 'billing', 'family', 'team', 'offer_lifecycle', 'reports', 'offers', 'tips', 'admin'] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export const UNSUBSCRIBABLE: readonly EmailCategory[] = ['reports', 'offers', 'tips'];

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  security: 'Sécurité du compte',
  account: 'Compte',
  billing: 'Abonnement et facturation',
  family: 'Vie de famille',
  team: 'Équipe',
  offer_lifecycle: 'Suivi des offres',
  reports: 'Bilans et rapports',
  offers: 'Bons et avantages partenaires',
  tips: 'Conseils et relances',
  admin: 'Opérations Rekonect',
};

export interface EmailUrls {
  /** Lien profond de l'app mobile (ex. rekonect://). */
  app: string;
  partners: string;
  admin: string;
}

interface Definition<D> {
  audience: EmailAudience;
  category: EmailCategory;
  render: (data: D, urls: EmailUrls) => EmailContent;
}

const define = <D>(d: Definition<D>) => d;

/** « rekonect:// » + « parent/x » → « rekonect://parent/x » (on ne retire qu'une barre finale). */
const app = (u: EmailUrls, path: string) => `${u.app.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
const web = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const q = (s: string) => `« ${s} »`;
const hello = (name?: string | null) => (name ? `Bonjour ${name.split(' ')[0]},` : 'Bonjour,');

export interface PeriodStats {
  unlocked: number;
  redeemed: number;
  impressions: number;
  basketLabel: string | null;
  redemptionRate: string;
  topOffer: string | null;
}

interface ChildLine {
  name: string;
  activities: number;
  minutes: number;
  points: number;
}

export const EMAILS = {
  // ═══ Compte et sécurité (tous publics) ═════════════════════════════════════

  'auth.password_reset': define<{ url: string }>({
    audience: 'any',
    category: 'security',
    render: (d) => ({
      subject: 'Réinitialisation de votre mot de passe',
      preheader: 'Ce lien est valable une heure.',
      title: 'Réinitialiser votre mot de passe',
      blocks: [
        { kind: 'p', text: 'Vous avez demandé à réinitialiser votre mot de passe Rekonect. Ce lien est valable une heure.' },
        { kind: 'note', text: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez cet email : votre mot de passe reste inchangé.' },
      ],
      cta: { label: 'Choisir un nouveau mot de passe', url: d.url },
    }),
  }),

  'auth.password_changed': define<Record<string, never>>({
    audience: 'any',
    category: 'security',
    render: () => ({
      subject: 'Votre mot de passe a été modifié',
      preheader: 'Vos autres sessions ont été fermées.',
      title: 'Mot de passe modifié',
      tone: 'success',
      blocks: [
        { kind: 'p', text: 'Le mot de passe de votre compte Rekonect vient d’être modifié et vos autres sessions ont été fermées.' },
        { kind: 'note', tone: 'danger', text: 'Si vous n’êtes pas à l’origine de ce changement, réinitialisez votre mot de passe tout de suite et contactez-nous.' },
      ],
    }),
  }),

  'auth.email_changed': define<{ newEmail: string }>({
    audience: 'any',
    category: 'security',
    render: (d) => ({
      subject: 'L’adresse de votre compte Rekonect a changé',
      preheader: `Nouvelle adresse : ${d.newEmail}`,
      title: 'Adresse email modifiée',
      blocks: [
        { kind: 'p', text: 'L’adresse de connexion de votre compte Rekonect vient d’être modifiée. Les prochains emails partiront vers la nouvelle adresse.' },
        { kind: 'rows', rows: [{ label: 'Nouvelle adresse', value: d.newEmail }] },
        { kind: 'note', tone: 'danger', text: 'Si vous n’êtes pas à l’origine de ce changement, contactez-nous immédiatement.' },
      ],
    }),
  }),

  'auth.new_login': define<{ device: string; when: string }>({
    audience: 'any',
    category: 'security',
    render: (d) => ({
      subject: 'Nouvelle connexion à votre compte Rekonect',
      preheader: `${d.device} · ${d.when}`,
      title: 'Nouvelle connexion détectée',
      blocks: [
        { kind: 'p', text: 'Votre compte vient d’être utilisé depuis un appareil que nous ne connaissions pas.' },
        { kind: 'rows', rows: [{ label: 'Appareil', value: d.device }, { label: 'Date', value: d.when }] },
        { kind: 'note', text: 'C’est bien vous ? Rien à faire. Sinon, changez votre mot de passe : toutes les sessions seront fermées.' },
      ],
    }),
  }),

  // ═══ Parents ══════════════════════════════════════════════════════════════

  'parent.welcome': define<{ name: string | null }>({
    audience: 'parent',
    category: 'account',
    render: (d, u) => ({
      subject: 'Bienvenue sur Rekonect',
      preheader: 'Trois étapes pour lancer la première activité hors écran.',
      title: `Bienvenue${d.name ? ` ${d.name.split(' ')[0]}` : ''} !`,
      blocks: [
        { kind: 'p', text: 'Votre compte parent est prêt. Rekonect aide vos enfants à passer à l’action hors écran, sans que vous ayez à les surveiller en permanence.' },
        { kind: 'list', items: ['Ajoutez le profil de votre enfant', 'Reliez son téléphone avec le code affiché dans l’app', 'Proposez-lui une première activité : il gagne des points, vous validez'] },
      ],
      cta: { label: 'Ouvrir Rekonect', url: app(u, 'parent') },
    }),
  }),

  'parent.child_added': define<{ childName: string }>({
    audience: 'parent',
    category: 'family',
    render: (d, u) => ({
      subject: `Le profil de ${d.childName} est prêt`,
      preheader: 'Dernière étape : relier son téléphone.',
      title: `${d.childName} a rejoint votre famille Rekonect`,
      blocks: [
        { kind: 'p', text: `Il reste une étape : relier le téléphone de ${d.childName}. Depuis sa fiche, affichez le code de liaison et saisissez-le sur son appareil, ou scannez le QR code.` },
        { kind: 'note', tone: 'info', text: 'Pas de téléphone ? Vous pouvez aussi valider ses activités depuis votre propre appareil.' },
      ],
      cta: { label: `Relier le téléphone de ${d.childName}`, url: app(u, 'parent/children') },
    }),
  }),

  'parent.device_linked': define<{ childName: string }>({
    audience: 'parent',
    category: 'security',
    render: (d, u) => ({
      subject: `Le téléphone de ${d.childName} est relié`,
      preheader: 'Il se connecte désormais avec son code PIN.',
      title: 'Appareil relié',
      tone: 'success',
      blocks: [
        { kind: 'p', text: `${d.childName} vient de relier son téléphone à votre famille. Il se connecte désormais avec son code PIN.` },
        { kind: 'note', text: 'Ce n’était pas prévu ? Déconnectez ses appareils depuis sa fiche : la liaison sera annulée.' },
      ],
      cta: { label: 'Voir sa fiche', url: app(u, 'parent/children') },
    }),
  }),

  'parent.coparent_invitation': define<{ inviterName: string; role: string; url: string; token: string }>({
    audience: 'parent',
    category: 'family',
    render: (d) => ({
      subject: `${d.inviterName} vous invite à rejoindre sa famille sur Rekonect`,
      preheader: 'Suivez ensemble les activités hors écran des enfants.',
      title: 'Vous êtes invité à rejoindre une famille',
      blocks: [
        { kind: 'p', text: `${d.inviterName} vous invite à rejoindre sa famille Rekonect en tant que ${d.role}. Vous pourrez proposer des activités, les valider et remettre les récompenses.` },
        { kind: 'code', label: 'Code d’invitation', value: d.token },
        { kind: 'p', text: 'Installez Rekonect, créez votre compte avec cette adresse email, puis ouvrez le lien ci-dessous (ou saisissez le code dans « Rejoindre une famille »).' },
      ],
      cta: { label: 'Rejoindre la famille', url: d.url },
    }),
  }),

  'parent.coparent_joined': define<{ memberName: string }>({
    audience: 'parent',
    category: 'family',
    render: (d, u) => ({
      subject: `${d.memberName} a rejoint votre famille`,
      preheader: 'Vous pouvez désormais accompagner les enfants à deux.',
      title: `${d.memberName} a rejoint votre famille`,
      tone: 'success',
      blocks: [{ kind: 'p', text: `${d.memberName} a accepté votre invitation. Vous recevrez tous les deux les demandes des enfants ; la première personne qui valide s’en occupe.` }],
      cta: { label: 'Gérer les membres', url: app(u, 'family') },
    }),
  }),

  'parent.first_activity': define<{ childName: string; activityTitle: string; points: number }>({
    audience: 'parent',
    category: 'family',
    render: (d, u) => ({
      subject: `Première activité réussie pour ${d.childName} 🎉`,
      preheader: `${q(d.activityTitle)} · +${d.points} points`,
      title: 'Le premier pas est fait',
      tone: 'success',
      blocks: [
        { kind: 'p', text: `${d.childName} vient de terminer sa première activité hors écran : ${q(d.activityTitle)}. +${d.points} points !` },
        { kind: 'p', text: 'Pour que l’habitude s’installe, fixez ensemble une récompense atteignable dans la semaine : c’est ce qui motive le plus les enfants au début.' },
      ],
      cta: { label: 'Créer une récompense', url: app(u, 'parent/rewards') },
    }),
  }),

  'parent.reward_waiting': define<{ childName: string; rewardTitle: string; since: string }>({
    audience: 'parent',
    category: 'family',
    render: (d, u) => ({
      subject: `${d.childName} attend sa récompense`,
      preheader: `${q(d.rewardTitle)} — débloquée ${d.since}`,
      title: `${d.childName} attend toujours sa récompense`,
      tone: 'warning',
      blocks: [
        { kind: 'p', text: `${d.childName} a débloqué ${q(d.rewardTitle)} ${d.since}. Une récompense remise rapidement, c’est ce qui donne envie de recommencer.` },
        { kind: 'note', text: 'Pas possible tout de suite ? Validez-la quand même et choisissez le moment : il saura qu’elle arrive.' },
      ],
      cta: { label: 'Voir la récompense', url: app(u, 'parent/rewards') },
    }),
  }),

  'parent.weekly_report': define<{ weekLabel: string; activities: number; minutesLabel: string; points: number; pendingRewards: number; children: ChildLine[]; highlight: string | null }>({
    audience: 'parent',
    category: 'reports',
    render: (d, u) => ({
      subject: '📊 Votre semaine avec Rekonect',
      preheader: `${plural(d.activities, 'activité')} hors écran · ${d.minutesLabel}`,
      eyebrow: d.weekLabel,
      title: d.activities > 0 ? 'Une semaine bien remplie' : 'Une nouvelle semaine commence',
      tone: 'success',
      blocks: [
        { kind: 'stats', items: [{ label: 'activités', value: String(d.activities) }, { label: 'hors écran', value: d.minutesLabel }, { label: 'points gagnés', value: String(d.points) }] },
        ...(d.children.length
          ? [{ kind: 'rows' as const, rows: d.children.map((c) => ({ label: c.name, value: `${plural(c.activities, 'activité')} · ${c.points} pts` })) }]
          : []),
        ...(d.highlight ? [{ kind: 'note' as const, tone: 'success' as const, text: d.highlight }] : []),
        ...(d.pendingRewards > 0 ? [{ kind: 'note' as const, tone: 'warning' as const, text: `${plural(d.pendingRewards, 'récompense attend', 'récompenses attendent')} votre validation.` }] : []),
      ],
      cta: { label: 'Voir le bilan', url: app(u, 'parent/dashboard') },
    }),
  }),

  'parent.monthly_report': define<{ monthLabel: string; activities: number; minutesLabel: string; points: number; rewards: number; children: ChildLine[]; trend: string | null }>({
    audience: 'parent',
    category: 'reports',
    render: (d, u) => ({
      subject: `Votre mois de ${d.monthLabel} avec Rekonect`,
      preheader: `${plural(d.activities, 'activité')} · ${d.minutesLabel} hors écran`,
      eyebrow: `Bilan de ${d.monthLabel}`,
      title: 'Le mois en un coup d’œil',
      blocks: [
        { kind: 'stats', items: [{ label: 'activités', value: String(d.activities) }, { label: 'hors écran', value: d.minutesLabel }, { label: 'récompenses', value: String(d.rewards) }] },
        ...(d.children.length ? [{ kind: 'rows' as const, rows: d.children.map((c) => ({ label: c.name, value: `${plural(c.activities, 'activité')} · ${c.points} pts` })) }] : []),
        ...(d.trend ? [{ kind: 'note' as const, tone: 'info' as const, text: d.trend }] : []),
      ],
      cta: { label: 'Voir le détail', url: app(u, 'parent/dashboard') },
    }),
  }),

  'parent.voucher_unlocked': define<{ childName: string | null; partnerName: string; offerTitle: string; discountLabel: string | null; expiresLabel: string | null; claimId: string }>({
    audience: 'parent',
    category: 'offers',
    render: (d, u) => ({
      subject: `🎟️ Nouveau bon ${d.partnerName} dans votre portefeuille`,
      preheader: d.childName ? `Débloqué grâce aux activités de ${d.childName}` : d.offerTitle,
      eyebrow: d.partnerName,
      title: d.offerTitle,
      tone: 'success',
      blocks: [
        { kind: 'p', text: d.childName ? `Grâce aux activités de ${d.childName}, vous avez débloqué un bon ${d.partnerName}.` : `Vous avez débloqué un bon ${d.partnerName}.` },
        { kind: 'rows', rows: [...(d.discountLabel ? [{ label: 'Avantage', value: d.discountLabel }] : []), ...(d.expiresLabel ? [{ label: 'Valable jusqu’au', value: d.expiresLabel }] : [])] },
        { kind: 'p', text: 'Présentez le QR code du bon en magasin, depuis votre portefeuille dans l’app.' },
      ],
      cta: { label: 'Ouvrir le bon', url: app(u, `parent/offers/${d.claimId}`) },
    }),
  }),

  'parent.voucher_expiring': define<{ partnerName: string; offerTitle: string; expiresLabel: string; claimId: string }>({
    audience: 'parent',
    category: 'offers',
    render: (d, u) => ({
      subject: `Votre bon ${d.partnerName} expire bientôt`,
      preheader: `${d.offerTitle} · jusqu’au ${d.expiresLabel}`,
      title: 'Pensez à utiliser votre bon',
      tone: 'warning',
      blocks: [{ kind: 'p', text: `${q(d.offerTitle)} chez ${d.partnerName} est valable jusqu’au ${d.expiresLabel}. Il suffit de présenter le QR code en magasin.` }],
      cta: { label: 'Afficher le QR code', url: app(u, `parent/offers/${d.claimId}`) },
    }),
  }),

  'parent.subscription_started': define<{ planName: string; amountLabel: string; interval: string; features: string[] }>({
    audience: 'parent',
    category: 'billing',
    render: (d, u) => ({
      subject: `Bienvenue dans ${d.planName}`,
      preheader: `${d.amountLabel} ${d.interval}`,
      title: `Votre abonnement ${d.planName} est actif`,
      tone: 'success',
      blocks: [
        { kind: 'p', text: `Merci pour votre confiance ! Votre abonnement ${d.planName} (${d.amountLabel} ${d.interval}) est actif.` },
        ...(d.features.length ? [{ kind: 'list' as const, items: d.features }] : []),
      ],
      cta: { label: 'Gérer mon abonnement', url: app(u, 'parent/subscription') },
    }),
  }),

  'parent.subscription_changed': define<{ planName: string; previousPlanName: string; upgrade: boolean }>({
    audience: 'parent',
    category: 'billing',
    render: (d, u) => ({
      subject: `Votre abonnement passe à ${d.planName}`,
      preheader: `Ancien plan : ${d.previousPlanName}`,
      title: d.upgrade ? `Bienvenue dans ${d.planName}` : `Votre plan devient ${d.planName}`,
      blocks: [{ kind: 'p', text: d.upgrade ? `Votre famille profite maintenant de ${d.planName}. Le changement est immédiat, au prorata.` : `Votre abonnement passe de ${d.previousPlanName} à ${d.planName}.` }],
      cta: { label: 'Voir mon abonnement', url: app(u, 'parent/subscription') },
    }),
  }),

  'parent.subscription_cancelled': define<{ planName: string; endLabel: string | null }>({
    audience: 'parent',
    category: 'billing',
    render: (d, u) => ({
      subject: 'Votre abonnement Rekonect est résilié',
      preheader: d.endLabel ? `Accès maintenu jusqu’au ${d.endLabel}` : 'Retour au plan gratuit',
      title: 'Résiliation confirmée',
      blocks: [
        { kind: 'p', text: d.endLabel ? `Votre abonnement ${d.planName} reste actif jusqu’au ${d.endLabel}, puis votre famille passera au plan gratuit. Rien n’est perdu : points, récompenses et historique sont conservés.` : `Votre famille est passée au plan gratuit. Points, récompenses et historique sont conservés.` },
        { kind: 'note', text: 'Vous changez d’avis ? Vous pouvez réactiver l’abonnement en un clic avant la fin de la période.' },
      ],
      cta: { label: 'Réactiver', url: app(u, 'parent/subscription') },
    }),
  }),

  'parent.trial_ending': define<{ planName: string; endLabel: string; amountLabel: string }>({
    audience: 'parent',
    category: 'billing',
    render: (d, u) => ({
      subject: `Votre essai ${d.planName} se termine le ${d.endLabel}`,
      preheader: `Ensuite : ${d.amountLabel}`,
      title: 'Votre essai touche à sa fin',
      tone: 'warning',
      blocks: [{ kind: 'p', text: `Votre essai gratuit de ${d.planName} se termine le ${d.endLabel}. Sans action de votre part, l’abonnement continue à ${d.amountLabel}.` }],
      cta: { label: 'Gérer mon abonnement', url: app(u, 'parent/subscription') },
    }),
  }),

  'parent.payment_failed': define<{ amountLabel: string; planName: string }>({
    audience: 'parent',
    category: 'billing',
    render: (d, u) => ({
      subject: 'Paiement refusé',
      preheader: `${d.amountLabel} · plan ${d.planName}`,
      title: 'Votre paiement n’a pas abouti',
      tone: 'danger',
      blocks: [
        { kind: 'p', text: `Le paiement de ${d.amountLabel} pour votre plan ${d.planName} a été refusé. Mettez à jour votre moyen de paiement pour que vos enfants gardent tous leurs avantages.` },
        { kind: 'note', text: 'Nous réessaierons automatiquement dans les prochains jours.' },
      ],
      cta: { label: 'Mettre à jour le paiement', url: app(u, 'parent/subscription') },
    }),
  }),

  'parent.payment_recovered': define<{ amountLabel: string; planName: string }>({
    audience: 'parent',
    category: 'billing',
    render: (d) => ({
      subject: 'Paiement régularisé, merci !',
      preheader: `${d.amountLabel} · plan ${d.planName}`,
      title: 'Tout est rentré dans l’ordre',
      tone: 'success',
      blocks: [{ kind: 'p', text: `Nous avons bien reçu votre paiement de ${d.amountLabel}. Votre plan ${d.planName} continue normalement.` }],
    }),
  }),

  'parent.inactive_nudge': define<{ childNames: string[]; days: number; idea: string | null }>({
    audience: 'parent',
    category: 'tips',
    render: (d, u) => ({
      subject: 'Une idée d’activité pour cette semaine ?',
      preheader: d.idea ? `Par exemple : ${d.idea}` : 'Quelques minutes suffisent pour relancer l’envie.',
      title: 'Et si on relançait l’envie ?',
      blocks: [
        { kind: 'p', text: `Aucune activité n’a été faite depuis ${d.days} jours${d.childNames.length ? ` chez ${d.childNames.join(' et ')}` : ''}. C’est normal : les semaines chargées arrivent à tout le monde.` },
        ...(d.idea ? [{ kind: 'note' as const, tone: 'info' as const, text: `Une idée rapide : ${d.idea}.` }] : []),
        { kind: 'p', text: 'Proposer une activité courte, avec une petite récompense à la clé, suffit souvent à relancer la dynamique.' },
      ],
      cta: { label: 'Proposer une activité', url: app(u, 'parent/activities') },
    }),
  }),

  'parent.account_deleted': define<{ name: string | null }>({
    audience: 'parent',
    category: 'account',
    render: (d) => ({
      subject: 'Votre compte Rekonect a été supprimé',
      preheader: 'Toutes les données de votre famille ont été effacées.',
      title: 'Compte supprimé',
      blocks: [
        { kind: 'p', text: `${hello(d.name)} votre compte et toutes les données de votre famille (profils enfants, activités, points, récompenses) ont été supprimés définitivement.` },
        { kind: 'p', text: 'Merci d’avoir essayé Rekonect. Vous serez toujours le bienvenu.' },
      ],
    }),
  }),

  /** Relais par email d'une notification importante (canal email du moteur de notifications). */
  'parent.notification': define<{ title: string; body: string; route: string | null }>({
    audience: 'parent',
    category: 'family',
    render: (d, u) => ({
      subject: d.title,
      preheader: d.body.split('\n')[0] ?? '',
      title: d.title.replace(/^\p{Extended_Pictographic}️?\s*/u, ''),
      blocks: d.body.split('\n').filter(Boolean).map((text) => ({ kind: 'p' as const, text })),
      cta: d.route ? { label: 'Ouvrir Rekonect', url: app(u, d.route) } : undefined,
    }),
  }),

  // ═══ Partenaires ══════════════════════════════════════════════════════════

  'partner.invitation': define<{ partnerName: string; role: string; url: string; inviterName: string | null }>({
    audience: 'partner',
    category: 'team',
    render: (d) => ({
      subject: `Invitation à rejoindre ${d.partnerName} sur Rekonect`,
      preheader: `Rôle : ${d.role} · lien valable 7 jours`,
      eyebrow: 'Portail partenaires',
      title: `Rejoignez ${d.partnerName}`,
      blocks: [
        { kind: 'p', text: `${d.inviterName ? `${d.inviterName} vous invite` : 'Vous êtes invité'} à gérer les offres de ${d.partnerName} sur le portail partenaires Rekonect, en tant que ${d.role}.` },
        { kind: 'p', text: 'Vous pourrez créer des bons et récompenses pour les familles, valider les bons en caisse et suivre les résultats.' },
        { kind: 'note', text: 'Ce lien est valable 7 jours.' },
      ],
      cta: { label: 'Accepter l’invitation', url: d.url },
    }),
  }),

  'partner.welcome': define<{ name: string | null; partnerName: string; role: string; hasOffer: boolean }>({
    audience: 'partner',
    category: 'team',
    render: (d, u) => ({
      subject: `Bienvenue sur le portail partenaires ${d.partnerName}`,
      preheader: d.hasOffer ? 'Votre espace est prêt.' : 'Créez votre première offre en quelques minutes.',
      eyebrow: 'Portail partenaires',
      title: `Bienvenue${d.name ? ` ${d.name.split(' ')[0]}` : ''} !`,
      blocks: [
        { kind: 'p', text: `Votre accès ${d.role} à ${d.partnerName} est actif.` },
        ...(d.hasOffer
          ? []
          : [{ kind: 'list' as const, items: ['Ajoutez vos lieux (adresse et coordonnées) pour cibler les familles proches', 'Créez un bon ou une récompense : l’équipe Rekonect la relit sous 48 h', 'Validez les bons en caisse en scannant le QR code'] }]),
      ],
      cta: { label: 'Ouvrir le portail', url: web(u.partners, d.hasOffer ? '/' : '/offers/new') },
    }),
  }),

  'partner.member_joined': define<{ partnerName: string; memberName: string; memberEmail: string; role: string }>({
    audience: 'partner',
    category: 'team',
    render: (d, u) => ({
      subject: `${d.memberName} a rejoint ${d.partnerName}`,
      preheader: `Rôle : ${d.role}`,
      eyebrow: 'Équipe',
      title: 'Un nouveau membre dans l’équipe',
      blocks: [{ kind: 'rows', rows: [{ label: 'Membre', value: d.memberName }, { label: 'Email', value: d.memberEmail }, { label: 'Rôle', value: d.role }] }],
      cta: { label: 'Gérer l’équipe', url: web(u.partners, '/billing') },
    }),
  }),

  'partner.member_role_changed': define<{ partnerName: string; role: string; previousRole: string }>({
    audience: 'partner',
    category: 'team',
    render: (d, u) => ({
      subject: `Votre rôle chez ${d.partnerName} a changé`,
      preheader: `${d.previousRole} → ${d.role}`,
      eyebrow: 'Équipe',
      title: `Vous êtes désormais ${d.role}`,
      blocks: [{ kind: 'p', text: `Votre rôle sur le portail ${d.partnerName} passe de ${d.previousRole} à ${d.role}. Vos accès ont été mis à jour.` }],
      cta: { label: 'Ouvrir le portail', url: web(u.partners, '/') },
    }),
  }),

  'partner.member_revoked': define<{ partnerName: string }>({
    audience: 'partner',
    category: 'team',
    render: (d) => ({
      subject: `Votre accès à ${d.partnerName} a été retiré`,
      preheader: 'Vous ne pouvez plus accéder au portail de ce partenaire.',
      eyebrow: 'Équipe',
      title: 'Accès retiré',
      blocks: [{ kind: 'p', text: `Un responsable de ${d.partnerName} a retiré votre accès au portail partenaires Rekonect. Pour toute question, contactez-le directement.` }],
    }),
  }),

  'partner.status_changed': define<{ partnerName: string; status: 'active' | 'suspended' }>({
    audience: 'partner',
    category: 'account',
    render: (d, u) => ({
      subject: d.status === 'suspended' ? `Compte ${d.partnerName} suspendu` : `Compte ${d.partnerName} réactivé`,
      preheader: d.status === 'suspended' ? 'Vos offres ne sont plus visibles.' : 'Vos offres sont de nouveau visibles.',
      eyebrow: 'Portail partenaires',
      title: d.status === 'suspended' ? 'Votre compte est suspendu' : 'Votre compte est réactivé',
      tone: d.status === 'suspended' ? 'danger' : 'success',
      blocks: [
        {
          kind: 'p',
          text:
            d.status === 'suspended'
              ? `Le compte ${d.partnerName} a été suspendu par l’équipe Rekonect : vos offres ne sont plus proposées aux familles. Les bons déjà obtenus restent utilisables.`
              : `Le compte ${d.partnerName} est de nouveau actif : vos offres publiées sont à nouveau proposées aux familles.`,
        },
      ],
      cta: { label: 'Ouvrir le portail', url: web(u.partners, '/') },
    }),
  }),

  'partner.offer_submitted': define<{ offerTitle: string; offerId: string }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Offre envoyée en relecture : ${d.offerTitle}`,
      preheader: 'Réponse de l’équipe Rekonect sous 48 h ouvrées.',
      eyebrow: 'Offres',
      title: 'Votre offre est en relecture',
      tone: 'info',
      blocks: [{ kind: 'p', text: `Merci ! ${q(d.offerTitle)} est entre les mains de l’équipe Rekonect. Nous vérifions que l’offre est claire et adaptée aux familles, en général sous 48 h ouvrées.` }],
      cta: { label: 'Voir l’offre', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.offer_published': define<{ offerTitle: string; offerId: string; audienceLabel: string | null }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Offre publiée : ${d.offerTitle}`,
      preheader: 'Les familles concernées peuvent la débloquer dès maintenant.',
      eyebrow: 'Offres',
      title: 'Votre offre est en ligne',
      tone: 'success',
      blocks: [
        { kind: 'p', text: `${q(d.offerTitle)} a été validée par l’équipe Rekonect et est désormais visible par les familles concernées.` },
        ...(d.audienceLabel ? [{ kind: 'note' as const, tone: 'info' as const, text: `Audience : ${d.audienceLabel}` }] : []),
      ],
      cta: { label: 'Suivre les résultats', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.offer_rejected': define<{ offerTitle: string; offerId: string; reason: string; changesOnly: boolean }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Offre à revoir : ${d.offerTitle}`,
      preheader: d.reason,
      eyebrow: 'Offres',
      title: d.changesOnly ? 'Quelques modifications avant publication' : 'Votre offre n’a pas été publiée',
      tone: 'warning',
      blocks: [
        { kind: 'p', text: `${q(d.offerTitle)} ${d.changesOnly ? 'est presque prête.' : 'n’a pas été validée.'}` },
        { kind: 'note', tone: 'warning', text: d.changesOnly ? `Modifications demandées : ${d.reason}` : `Motif : ${d.reason}` },
        { kind: 'p', text: 'Vous pouvez la modifier et la soumettre à nouveau.' },
      ],
      cta: { label: 'Modifier l’offre', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.offer_expiring': define<{ offerTitle: string; offerId: string; endLabel: string; unlocked: number }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Votre offre ${q(d.offerTitle)} se termine le ${d.endLabel}`,
      preheader: `${plural(d.unlocked, 'bon obtenu')} jusqu’ici`,
      eyebrow: 'Offres',
      title: 'Votre offre se termine bientôt',
      tone: 'warning',
      blocks: [
        { kind: 'p', text: `${q(d.offerTitle)} ne sera plus proposée aux familles après le ${d.endLabel}. ${plural(d.unlocked, 'bon a', 'bons ont')} été obtenu${d.unlocked > 1 ? 's' : ''} jusqu’ici.` },
        { kind: 'p', text: 'Pour continuer, prolongez la date de fin ou dupliquez l’offre avec une nouvelle période.' },
      ],
      cta: { label: 'Prolonger l’offre', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.offer_ended': define<{ offerTitle: string; offerId: string; unlocked: number; redeemed: number }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Offre terminée : ${d.offerTitle}`,
      preheader: `${plural(d.unlocked, 'bon obtenu')} · ${plural(d.redeemed, 'utilisé')}`,
      eyebrow: 'Offres',
      title: 'Votre offre est terminée',
      blocks: [
        { kind: 'stats', items: [{ label: 'bons obtenus', value: String(d.unlocked) }, { label: 'bons utilisés', value: String(d.redeemed) }] },
        { kind: 'p', text: 'Les bons déjà obtenus restent utilisables jusqu’à leur propre date d’expiration.' },
      ],
      cta: { label: 'Relancer une offre', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.stock_low': define<{ offerTitle: string; offerId: string; remaining: number; total: number }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Plus que ${plural(d.remaining, 'bon')} pour ${q(d.offerTitle)}`,
      preheader: `${d.total - d.remaining} sur ${d.total} déjà obtenus`,
      eyebrow: 'Offres',
      title: 'Votre offre a du succès',
      tone: 'warning',
      blocks: [{ kind: 'p', text: `${d.total - d.remaining} des ${d.total} bons de ${q(d.offerTitle)} ont déjà été obtenus. Augmentez le stock pour ne pas décevoir les familles.` }],
      cta: { label: 'Augmenter le stock', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.sold_out': define<{ offerTitle: string; offerId: string; total: number }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: `Stock épuisé : ${d.offerTitle}`,
      preheader: `Les ${d.total} bons ont été obtenus.`,
      eyebrow: 'Offres',
      title: 'Tous les bons sont partis 🎉',
      tone: 'success',
      blocks: [{ kind: 'p', text: `Les ${d.total} bons de ${q(d.offerTitle)} ont été obtenus : l’offre n’est plus proposée. Ajoutez du stock pour la relancer.` }],
      cta: { label: 'Ajouter du stock', url: web(u.partners, `/offers/${d.offerId}`) },
    }),
  }),

  'partner.first_redemption': define<{ offerTitle: string; placeName: string | null }>({
    audience: 'partner',
    category: 'offer_lifecycle',
    render: (d, u) => ({
      subject: 'Premier bon utilisé en magasin 🎉',
      preheader: d.placeName ? `${d.offerTitle} · ${d.placeName}` : d.offerTitle,
      eyebrow: 'Premier passage',
      title: 'Une famille Rekonect est venue chez vous',
      tone: 'success',
      blocks: [{ kind: 'p', text: `Le premier bon ${q(d.offerTitle)} vient d’être utilisé${d.placeName ? ` à ${d.placeName}` : ''}. C’est le début : suivez vos passages en temps réel depuis le portail.` }],
      cta: { label: 'Voir les passages', url: web(u.partners, '/redeem') },
    }),
  }),

  'partner.milestone': define<{ partnerName: string; count: number }>({
    audience: 'partner',
    category: 'reports',
    render: (d, u) => ({
      subject: `${d.count} bons obtenus par les familles 🎉`,
      preheader: `Un cap franchi pour ${d.partnerName}`,
      eyebrow: 'Cap franchi',
      title: `${d.count} familles ont gagné un bon ${d.partnerName}`,
      tone: 'success',
      blocks: [{ kind: 'p', text: `Chacun de ces bons récompense des enfants qui ont posé leur écran pour faire une activité. Merci de faire partie de l’aventure.` }],
      cta: { label: 'Voir les statistiques', url: web(u.partners, '/') },
    }),
  }),

  'partner.weekly_report': define<{ partnerName: string; weekLabel: string; stats: PeriodStats; liveOffers: number; tip: string | null }>({
    audience: 'partner',
    category: 'reports',
    render: (d, u) => ({
      subject: `${d.partnerName} · votre semaine sur Rekonect`,
      preheader: `${plural(d.stats.unlocked, 'bon obtenu')} · ${plural(d.stats.redeemed, 'utilisé')}`,
      eyebrow: d.weekLabel,
      title: 'Votre semaine en chiffres',
      blocks: [
        { kind: 'stats', items: [{ label: 'vues', value: String(d.stats.impressions) }, { label: 'bons obtenus', value: String(d.stats.unlocked) }, { label: 'utilisés', value: String(d.stats.redeemed), hint: d.stats.redemptionRate }] },
        { kind: 'rows', rows: [{ label: 'Offres en ligne', value: String(d.liveOffers) }, ...(d.stats.topOffer ? [{ label: 'Offre la plus demandée', value: d.stats.topOffer }] : []), ...(d.stats.basketLabel ? [{ label: 'Panier moyen', value: d.stats.basketLabel }] : [])] },
        ...(d.tip ? [{ kind: 'note' as const, tone: 'info' as const, text: d.tip }] : []),
      ],
      cta: { label: 'Voir le tableau de bord', url: web(u.partners, '/') },
    }),
  }),

  'partner.monthly_report': define<{ partnerName: string; monthLabel: string; stats: PeriodStats; previousUnlocked: number }>({
    audience: 'partner',
    category: 'reports',
    render: (d, u) => {
      const delta = d.stats.unlocked - d.previousUnlocked;
      return {
        subject: `${d.partnerName} · bilan de ${d.monthLabel}`,
        preheader: `${plural(d.stats.unlocked, 'bon obtenu')}${d.previousUnlocked ? ` (${delta >= 0 ? '+' : ''}${delta} vs mois précédent)` : ''}`,
        eyebrow: `Bilan de ${d.monthLabel}`,
        title: 'Votre mois sur Rekonect',
        blocks: [
          { kind: 'stats', items: [{ label: 'vues', value: String(d.stats.impressions) }, { label: 'bons obtenus', value: String(d.stats.unlocked) }, { label: 'utilisés', value: String(d.stats.redeemed), hint: d.stats.redemptionRate }] },
          { kind: 'rows', rows: [...(d.stats.topOffer ? [{ label: 'Offre la plus demandée', value: d.stats.topOffer }] : []), ...(d.stats.basketLabel ? [{ label: 'Panier moyen', value: d.stats.basketLabel }] : []), { label: 'Évolution des bons obtenus', value: d.previousUnlocked ? `${delta >= 0 ? '+' : ''}${delta}` : 'premier mois' }] },
        ],
        cta: { label: 'Exporter les statistiques', url: web(u.partners, '/') },
      };
    },
  }),

  'partner.onboarding_incomplete': define<{ partnerName: string; missing: string[] }>({
    audience: 'partner',
    category: 'tips',
    render: (d, u) => ({
      subject: `${d.partnerName} : plus que quelques étapes`,
      preheader: d.missing.join(' · '),
      eyebrow: 'Portail partenaires',
      title: 'Votre espace est presque prêt',
      blocks: [
        { kind: 'p', text: 'Pour que les familles découvrent vos offres, il reste :' },
        { kind: 'list', items: d.missing },
      ],
      cta: { label: 'Terminer la configuration', url: web(u.partners, '/') },
    }),
  }),

  'partner.no_live_offer': define<{ partnerName: string; days: number; lastOffer: string | null }>({
    audience: 'partner',
    category: 'tips',
    render: (d, u) => ({
      subject: 'Aucune offre en ligne en ce moment',
      preheader: 'Les familles près de chez vous attendent de nouveaux avantages.',
      eyebrow: d.partnerName,
      title: 'Et si vous relanciez une offre ?',
      blocks: [
        { kind: 'p', text: `Vous n’avez plus d’offre visible depuis ${d.days} jours. Les familles actives autour de vos lieux ne voient donc plus ${d.partnerName}.` },
        ...(d.lastOffer ? [{ kind: 'note' as const, tone: 'info' as const, text: `Astuce : dupliquez ${q(d.lastOffer)} pour la relancer en deux minutes.` }] : []),
      ],
      cta: { label: 'Créer une offre', url: web(u.partners, '/offers/new') },
    }),
  }),

  'partner.subscription_changed': define<{ partnerName: string; planName: string; previousPlanName: string | null; status: string }>({
    audience: 'partner',
    category: 'billing',
    render: (d, u) => ({
      subject: d.previousPlanName ? `${d.partnerName} passe au plan ${d.planName}` : `Abonnement ${d.planName} activé`,
      preheader: d.previousPlanName ? `Ancien plan : ${d.previousPlanName}` : 'Merci pour votre confiance.',
      eyebrow: 'Facturation',
      title: `Plan ${d.planName}`,
      tone: 'success',
      blocks: [{ kind: 'p', text: d.previousPlanName ? `L’abonnement de ${d.partnerName} passe de ${d.previousPlanName} à ${d.planName}. Les nouvelles limites s’appliquent immédiatement.` : `L’abonnement ${d.planName} de ${d.partnerName} est actif.` }],
      cta: { label: 'Compte & facturation', url: web(u.partners, '/billing') },
    }),
  }),

  'partner.trial_ending': define<{ partnerName: string; planName: string; endLabel: string }>({
    audience: 'partner',
    category: 'billing',
    render: (d, u) => ({
      subject: `Fin de l’essai ${d.planName} le ${d.endLabel}`,
      preheader: 'Choisissez votre plan pour garder vos offres en ligne.',
      eyebrow: 'Facturation',
      title: 'Votre période d’essai se termine',
      tone: 'warning',
      blocks: [{ kind: 'p', text: `L’essai ${d.planName} de ${d.partnerName} se termine le ${d.endLabel}. Ajoutez un moyen de paiement pour que vos offres restent visibles sans interruption.` }],
      cta: { label: 'Choisir mon plan', url: web(u.partners, '/billing') },
    }),
  }),

  'partner.payment_failed': define<{ partnerName: string; amountLabel: string }>({
    audience: 'partner',
    category: 'billing',
    render: (d, u) => ({
      subject: 'Paiement refusé',
      preheader: `${d.amountLabel} · abonnement ${d.partnerName}`,
      eyebrow: 'Facturation',
      title: 'Votre paiement n’a pas abouti',
      tone: 'danger',
      blocks: [
        { kind: 'p', text: `Le paiement de ${d.amountLabel} pour votre abonnement Rekonect partenaires n’a pas abouti.` },
        { kind: 'note', text: 'Mettez à jour votre moyen de paiement depuis Compte & facturation. Sans régularisation, vos offres pourraient être masquées.' },
      ],
      cta: { label: 'Mettre à jour le paiement', url: web(u.partners, '/billing') },
    }),
  }),

  'partner.invoice_available': define<{ partnerName: string; amountLabel: string; label: string; url: string | null; recovered: boolean }>({
    audience: 'partner',
    category: 'billing',
    render: (d, u) => ({
      subject: d.recovered ? 'Paiement régularisé, merci !' : `Votre facture Rekonect · ${d.label}`,
      preheader: `${d.amountLabel} · ${d.partnerName}`,
      eyebrow: 'Facturation',
      title: d.recovered ? 'Paiement bien reçu' : 'Votre facture est disponible',
      tone: 'success',
      blocks: [{ kind: 'rows', rows: [{ label: 'Période', value: d.label }, { label: 'Montant', value: d.amountLabel }] }],
      cta: { label: 'Télécharger la facture', url: d.url ?? web(u.partners, '/billing') },
    }),
  }),

  // ═══ Équipe Rekonect (back-office) ════════════════════════════════════════

  'admin.offer_to_moderate': define<{ partnerName: string; offerTitle: string; kindLabel: string; pending: number }>({
    audience: 'admin',
    category: 'admin',
    render: (d, u) => ({
      subject: `À relire : ${d.offerTitle} (${d.partnerName})`,
      preheader: `${plural(d.pending, 'offre')} en attente de relecture`,
      eyebrow: 'Modération',
      title: 'Nouvelle offre à relire',
      tone: 'info',
      blocks: [{ kind: 'rows', rows: [{ label: 'Partenaire', value: d.partnerName }, { label: 'Offre', value: d.offerTitle }, { label: 'Type', value: d.kindLabel }, { label: 'File d’attente', value: plural(d.pending, 'offre') }] }],
      cta: { label: 'Ouvrir la modération', url: web(u.admin, '/rewards') },
    }),
  }),

  'admin.activity_reported': define<{ activityTitle: string; reason: string; openReports: number }>({
    audience: 'admin',
    category: 'admin',
    render: (d, u) => ({
      subject: `Signalement : ${d.activityTitle}`,
      preheader: d.reason,
      eyebrow: 'Modération',
      title: 'Une activité a été signalée',
      tone: 'warning',
      blocks: [{ kind: 'rows', rows: [{ label: 'Activité', value: d.activityTitle }, { label: 'Motif', value: d.reason }, { label: 'Signalements ouverts', value: String(d.openReports) }] }],
      cta: { label: 'Traiter le signalement', url: web(u.admin, '/activities') },
    }),
  }),

  'admin.partner_payment_failed': define<{ partnerName: string; amountLabel: string }>({
    audience: 'admin',
    category: 'admin',
    render: (d, u) => ({
      subject: `Paiement partenaire refusé : ${d.partnerName}`,
      preheader: d.amountLabel,
      eyebrow: 'Facturation',
      title: 'Paiement partenaire refusé',
      tone: 'danger',
      blocks: [{ kind: 'p', text: `Le paiement de ${d.amountLabel} de ${d.partnerName} a échoué. Le partenaire a été prévenu ; un contact commercial peut aider.` }],
      cta: { label: 'Voir le partenaire', url: web(u.admin, '/partners') },
    }),
  }),

  'admin.partner_activated': define<{ partnerName: string; ownerEmail: string }>({
    audience: 'admin',
    category: 'admin',
    render: (d, u) => ({
      subject: `${d.partnerName} a activé son compte`,
      preheader: d.ownerEmail,
      eyebrow: 'Partenaires',
      title: 'Nouveau partenaire actif',
      tone: 'success',
      blocks: [{ kind: 'p', text: `${d.ownerEmail} a accepté l’invitation : ${d.partnerName} peut maintenant créer ses offres.` }],
      cta: { label: 'Voir le partenaire', url: web(u.admin, '/partners') },
    }),
  }),

  'admin.daily_digest': define<{ dateLabel: string; pendingOffers: number; openReports: number; newFamilies: number; paymentFailures: number; activitiesValidated: number }>({
    audience: 'admin',
    category: 'admin',
    render: (d, u) => ({
      subject: `Rekonect · point du ${d.dateLabel}`,
      preheader: `${plural(d.pendingOffers, 'offre')} à relire · ${plural(d.openReports, 'signalement')}`,
      eyebrow: d.dateLabel,
      title: 'Le point du jour',
      blocks: [
        { kind: 'stats', items: [{ label: 'offres à relire', value: String(d.pendingOffers) }, { label: 'signalements', value: String(d.openReports) }, { label: 'paiements refusés', value: String(d.paymentFailures) }] },
        { kind: 'rows', rows: [{ label: 'Nouvelles familles (24 h)', value: String(d.newFamilies) }, { label: 'Activités validées (24 h)', value: String(d.activitiesValidated) }] },
      ],
      cta: { label: 'Ouvrir le back-office', url: web(u.admin, '/') },
    }),
  }),
} as const;

export type EmailTemplateId = keyof typeof EMAILS;
export type EmailData<T extends EmailTemplateId> = Parameters<(typeof EMAILS)[T]['render']>[0];

export const EMAIL_TEMPLATE_IDS = Object.keys(EMAILS) as EmailTemplateId[];
