# Rekonect — Architecture cible

**Statut :** v2 — 24 septembre 2026 (API, back-office, portail partenaires et alignements mobile livrés)
**Décisions actées :** NestJS modulaire et événementiel · Postgres seul (Supabase ne sert plus qu'à héberger la base, et peut être remplacé) · Prisma · monorepo Turborepo · deux apps web Next.js (admin Rekonect, portail partenaires) · app mobile Ionic/Capacitor conservée.

---

## 1. Vue d'ensemble

```
                    ┌─────────────────────── monorepo Turborepo ───────────────────────┐
                    │                                                                  │
  apps/mobile ──────┤  Ionic 8 + Capacitor 6 (parent + enfant)                          │
  apps/admin  ──────┤  Next.js — back-office Rekonect (modération, catalogue, partenaires)│
  apps/partners ────┤  Next.js — portail partenaires (Decathlon, associations…)          │
                    │            │  REST /v1  +  WebSocket (notifications in-app)       │
                    │            ▼                                                     │
  apps/api ─────────┤  NestJS — deux points d'entrée, une seule base de code           │
                    │    main.ts   → API HTTP + WebSocket, sans état, N instances       │
                    │    worker.ts → relais outbox, consommateurs, scheduler, crons     │
                    │            │                                                     │
                    │            ▼                                                     │
                    │       PostgreSQL (Prisma)  ── LISTEN/NOTIFY ──► instances API     │
                    │                                                                  │
  packages/contracts ┤ événements versionnés + DTO zod partagés front/back             │
  packages/api-client┤ client HTTP typé (sessions, erreurs, formats FR)                 │
  packages/ui        ┤ composants web + jetons des maquettes Admin / Partenaire       │
  e2e                ┤ parcours Playwright des deux portails sur l'API réelle          │
                    └──────────────────────────────────────────────────────────────────┘
```

**Dépendances d'infrastructure : une seule, Postgres.** Pas de Redis ni de broker imposés au démarrage :

- la file d'événements est une **table outbox** lue avec `FOR UPDATE SKIP LOCKED` (plusieurs workers en parallèle sans doublon) ;
- les notifications programmées sont des lignes `status = 'scheduled'` lues de la même façon ;
- le temps réel entre worker et API passe par `LISTEN/NOTIFY` Postgres ;
- les crons prennent un verrou `pg_try_advisory_lock` : un seul worker les exécute, quel que soit le nombre de réplicas.

Quand le volume le justifiera, on branche NATS JetStream ou RabbitMQ derrière l'interface `EventTransport`, puis Redis pour l'adaptateur Socket.IO. **Aucun module métier ne change.**

---

## 2. Modules NestJS (bounded contexts)

| Module | Responsabilité | Tables | Événements publiés |
|---|---|---|---|
| `identity` | Comptes (parent, admin, partenaire), mots de passe argon2/bcrypt, JWT + refresh tokens, sessions d'appareil enfant (lien QR/code court + PIN) | `users`, `refresh_tokens`, `password_reset_tokens`, `child_link_tokens` | `user.registered`, `child.device_linked` |
| `families` | Profils parent, enfants, co-parents, invitations | `profiles`, `children`, `family_members`, `family_invitations`, `child_invitations` | `child.created`, `family.member_joined` |
| `activities` | Catalogue, catégories, cycle de vie `child_activities` | `activities`, `activity_categories`, `child_activities` | `activity.assigned`, `activity.planned`, `activity.submitted`, `activity.validated`, `activity.rejected`, `activity.abandoned` |
| `rewards` | Récompenses (famille, catalogue, partenaire) et demandes | `rewards`, `reward_requests` | `reward.requested`, `reward.approved`, `reward.rejected`, `reward.delivered` |
| `gamification` | Points (ledger), niveaux, badges, séries | `points_ledger`, `badges`, `child_badges` | `points.awarded`, `level.up`, `badge.earned` |
| `social` | Amitiés entre enfants, défis duo | `child_friends`, `duo_challenges` | `friend.requested`, `duo.invited`, `duo.accepted`, `duo.completed` |
| `rituals` | Rituels familiaux, occurrences, objectif hebdo | `family_rituals`, `family_ritual_occurrences`, `family_goals` | `ritual.scheduled`, `ritual.done`, `goal.progress`, `goal.completed` |
| `screen-time` | Relevés quotidiens, objectifs | `screen_time_daily` | `screen_time.goal_reached`, `screen_time.improved` |
| `partners` | Organisations partenaires, offres, codes, obtentions, statistiques anonymisées | `partners`, `partner_members`, `partner_offers`, `voucher_codes`, `offer_claims` | `offer.submitted`, `offer.published`, `offer.claimed`, `offer.redeemed` |
| `moderation` | File de relecture admin (offres, activités partenaires) | champs `review_*` sur les tables concernées | `offer.approved`, `offer.rejected` |
| `notifications` | Décision (préférences, quiet hours, âge, dédup, priorité, regroupement), templates, planification, canaux (in-app/push/email), jetons push | `notifications`, `notification_preferences`, `push_tokens`, `email_events` | `notification.sent` |
| `platform/events` | Outbox, relais, bus, idempotence consommateurs | `outbox_events`, `processed_events` | — |

**Règle d'étanchéité :** un module n'importe jamais le service d'un autre pour écrire. Il publie un événement, ou lit via une interface de lecture exposée par l'autre module. C'est ce qui rend chaque module extractible en microservice.

---

## 3. Structure événementielle

### Enveloppe (package `@rekonect/contracts`)

```ts
interface DomainEvent<T> {
  id: string;            // uuid — clé d'idempotence
  type: 'activity.validated' | …;
  version: 1;
  occurredAt: string;    // ISO
  aggregateType: 'child_activity' | 'reward_request' | …;
  aggregateId: string;
  actor?: { kind: 'parent' | 'child' | 'partner' | 'admin' | 'system'; id: string };
  correlationId?: string;
  payload: T;            // schéma zod versionné
}
```

### Garantie de livraison

1. Le service métier écrit **dans la même transaction** la donnée et la ligne `outbox_events`.
2. Le relais (worker) lit l'outbox par lots (`SKIP LOCKED`), publie sur le transport et marque `published_at`.
3. Chaque consommateur enregistre `(event_id, consumer)` dans `processed_events` : un événement rejoué n'a aucun effet (idempotence).
4. Échec d'un consommateur : `attempts++`, backoff exponentiel, puis `dead` après 10 essais. Les événements morts sont visibles dans l'admin.

### Exemple : `activity.validated`

```
POST /v1/child-activities/:id/validate  (parent)
 └─ transaction : child_activities → validated, points_ledger +pts, children.total_points/level,
                  badges, série, outbox ← activity.validated (+ level.up, badge.earned)
worker
 ├─ notifications   → enfant « 🎉 Bien joué ! +40 points » (ton selon l'âge)
 │                  → parent « ✅ Emma a terminé… » (in-app, regroupé par jour)
 │                  → annule les rappels programmés de cette activité
 ├─ rituals         → recalcule l'objectif familial de la semaine
 └─ partners        → offres déclenchées par cette activité ou sa catégorie
                      → offer_claims + notification parent « 🎟️ Bon Decathlon débloqué »
```

---

## 4. Système de notifications

Il reprend la logique déjà écrite en SQL (migrations 025 à 029), déplacée dans des services TypeScript testés :

```
événement → template (type × rôle × tranche d'âge) → préférences (type + canal)
          → quiet hours (fuseau du destinataire, critical passe toujours)
          → dédup (dedup_key unique) → regroupement (group_key)
          → notifications (sent | scheduled | suppressed)
          → canaux : in-app (WebSocket) · push (APNs/FCM, purge des tokens invalides) · email (Brevo)
          → deep link typé (route + entity) → destination exacte
```

- **Programmation :** rappels à T-15 min, relances de récompense à 24 h et 48 h, rituels J-1 et H-1. Au moment de l'envoi, `stillRelevant()` revérifie l'entité : pas de rappel sur une activité terminée, annulée ou abandonnée.
- **Tranches d'âge :** `young` (≤ 7 ans), `kid` (8–12), `teen` (13+). Ce sont les mêmes que pour le catalogue d'activités.
- **Priorités :** `critical` (sécurité) > `high` (action parent) > `normal` > `low` (conseil).
- **Emails :** seulement pour la sécurité, les invitations, le récapitulatif hebdomadaire et la facturation. Jamais un email par activité.
- **Partenaires :** un partenaire ne peut **jamais** notifier directement un enfant. Ses offres passent par la modération, puis par les mêmes règles de préférences (`partner_offers` est désactivé par défaut pour les enfants).

---

## 5. Partenaires : alignement avec le fonctionnement de Rekonect

### Principe

Un partenaire (Decathlon, une médiathèque, une association sportive…) **enrichit les mécaniques existantes** sans en créer de nouvelles. Il n'y a pas de second système de récompenses : ce que publie un partenaire devient une ligne du catalogue existant (`rewards`, `activities`), marquée `partner_id`.

### Trois types d'offres (`partner_offers.kind`)

| Type | Pour qui | Mécanique | Exemple |
|---|---|---|---|
| `child_reward` | Enfant | Une **récompense du catalogue** que l'enfant débloque avec ses points, puis demande au parent. Même circuit `reward_requests` (demande → parent → approbation), avec un code attribué à l'approbation | « Gourde Decathlon » à 300 points |
| `parent_voucher` | Parent | Un **bon ou code promo** débloqué par un événement : activité validée d'une catégorie, objectif familial atteint, niveau atteint | « −15 % sur le rayon vélo » quand l'enfant valide 3 activités Sport |
| `sponsored_activity` | Enfant/famille | Une **activité** proposée par le partenaire, ajoutée au catalogue après modération, et éventuellement couplée à un bon | « Initiation escalade au magasin, samedi 14 h » |

### Cycle de vie d'une offre

`draft → pending_review → published → paused → expired` (ou `rejected` avec un motif). **Toute publication passe par la modération Rekonect**, car le contenu est destiné à des enfants.

### Règles de protection de l'enfance (non négociables)

- Le partenaire ne voit **aucune donnée personnelle d'enfant** : statistiques agrégées seulement (vues, déblocages, utilisations), avec un seuil minimal de 10 pour éviter la ré-identification.
- Pas de lien sortant ni d'achat côté enfant. Les bons et codes promo sont remis au **parent**.
- Tranche d'âge obligatoire sur chaque offre, filtrée côté API.
- Stock (`stock_total`) et limite par famille (`per_family_limit`) vérifiés dans la même transaction que l'obtention.

### Nouvelles tables

`partners` (organisation, statut `pending | active | suspended`) · `partner_members` (utilisateur ↔ organisation, rôle `owner | editor | viewer`) · `partner_offers` · `voucher_codes` (réserve de codes uniques, ou code générique sur l'offre) · `offer_claims` (obtention par une famille, statut `unlocked | claimed | redeemed | expired | cancelled`). Colonnes ajoutées : `activities.partner_id`, `rewards.partner_offer_id`, `reward_type` étendu à `partner`, `users.role` étendu à `partner`.

---

## 6. Authentification sans Supabase Auth

| Acteur | Connexion | Jeton |
|---|---|---|
| Parent | email + mot de passe | access JWT 15 min + refresh token rotatif (haché en base, révocable) |
| Admin | email + mot de passe (rôle `admin`) | idem, et 2FA TOTP prévue |
| Partenaire | email + mot de passe, invité par un owner ou par un admin | idem, avec le scope `partner:<id>` |
| Enfant | lien QR ou code court à 6 caractères, puis PIN à 4 chiffres (5 essais, blocage 15 min) | jeton d'appareil `sub = child:<id>`, révocable par le parent |

Les règles RLS deviennent des **guards NestJS** : `@Roles()`, `ParentOwnsChild`, `ChildSelf`, `PartnerMember`. Elles sont testées unitairement.

**Migration des comptes existants :** `auth.users.encrypted_password` contient des hachés bcrypt. Ils sont copiés dans `users.password_hash`, et le vérificateur accepte bcrypt puis re-hache en argon2 à la connexion suivante. **Aucun utilisateur n'a à changer son mot de passe.**

---

## 7. Plan de migration

| Phase | Contenu | État |
|---|---|---|
| 0 | Monorepo Turborepo · API NestJS · Prisma sur le schéma existant · outbox · notifications · partenaires · abonnements Stripe · apps admin et partenaires | **livré** |
| 1 | L'app mobile passe de `supabase-js` à l'API, écran par écran (≈ 60 appels `.from()` et 9 RPC à remplacer). Déjà sur l'API : abonnement, bons partenaires, consentement, signalements | **commencé** |
| 2 | Import des comptes (`auth.users` → `users`), bascule de l'auth mobile, suppression de Supabase Auth | à faire |
| 3 | Désactivation des triggers, crons (`pg_cron`) et Edge Functions Supabase, remplacés par le worker ; pont Supabase → outbox pour les écrans mobiles encore sur supabase-js (§17) | **livré** |
| 4 | Base Postgres déplacée hors de Supabase si souhaité (`pg_dump` / `pg_restore`) | optionnel |
| 5 | Extraction de `notifications` (puis `partners`) en services séparés, derrière NATS | quand la charge le justifie |

Pendant les phases 1 à 3, **les triggers SQL et le worker ne doivent pas tourner en même temps sur la même base** (sinon les notifications partent en double). Le flag `NOTIFICATIONS_ENGINE=sql|api` contrôle la bascule.

---

## 8. Qualité

- **Tests unitaires** (Jest + SWC) : règles de décision, templates, quiet hours, niveaux et badges, guards, calcul de stock.
- **Tests d'intégration** : sur un Postgres réel (base jetable par exécution, migrations Prisma appliquées), avec les requêtes HTTP de bout en bout via supertest.
- **Seuils de couverture bloquants en CI** : 90 % lignes et fonctions sur `apps/api/src`, 80 % sur les apps web.
- `turbo run lint typecheck test build` doit être vert avant tout merge.

---

## 9. Inventaire des écrans web (brief initial, désormais livré — voir §12)

### Admin Rekonect (`apps/admin`)

| Écran | Contenu |
|---|---|
| Connexion | email + mot de passe (2FA à venir) |
| Tableau de bord | familles actives, activités validées sur 7 j, notifications envoyées/échouées, offres à modérer, événements en échec |
| Modération | file des offres et activités partenaires `pending_review` : aperçu tel que le verra l'enfant, approuver / refuser avec motif |
| Partenaires | liste + statut ; fiche : infos, membres, offres, statistiques ; créer / inviter, suspendre |
| Catalogue d'activités | liste filtrable (catégorie, âge, origine Rekonect/partenaire), création/édition, activation |
| Catalogue de récompenses | récompenses globales et partenaires, points requis, catégories |
| Badges & niveaux | seuils de niveaux, conditions des badges |
| Familles | recherche (email), détail en lecture seule : enfants, abonnement, activité récente. Pas d'accès aux contenus privés sans motif |
| Notifications | journal (type, statut, canal, erreurs), templates par type × tranche d'âge, envoi test |
| Événements | outbox : en attente, en échec, morts ; rejouer |
| Paramètres | admins, rôles |

### Portail partenaires (`apps/partners`)

| Écran | Contenu |
|---|---|
| Connexion / acceptation d'invitation | création du mot de passe à partir du lien |
| Tableau de bord | offres publiées, déblocages, utilisations, taux d'utilisation (agrégés) |
| Offres | liste par statut (brouillon, en relecture, publiée, en pause, expirée, refusée) |
| Créer / éditer une offre | assistant en 3 étapes : type (récompense enfant / bon parent / activité sponsorisée) → contenu (titre, description, visuel, tranche d'âge, points ou déclencheur, validité, stock, limite par famille) → aperçu mobile et envoi en relecture |
| Codes | import CSV de codes uniques ou code générique, stock restant |
| Statistiques d'une offre | courbe des déblocages et utilisations, sans donnée personnelle |
| Organisation | profil (nom, logo, site), membres et rôles |
| Compte | mot de passe, sessions |

---

## 10. Abonnements et facturation (Stripe)

- Table `plans` (familles : `free`, `family`, `family_plus` ; partenaires : `partner_local`, `partner_network`, `partner_public`), avec les **limites en JSON** (`maxChildren`, `maxCoParents`, `maxPlaces`, `maxRadiusKm`, `nationalTargeting`…) et les fonctionnalités affichées. L'admin modifie prix et limites ; les prix Stripe sont recréés automatiquement, les abonnés gardent leur tarif jusqu'au renouvellement.
- `BillingGateway` isole Stripe (API 2026-08-26) : Checkout, portail client, changement de plan au prorata, résiliation en fin de période, codes promo. Un faux gateway sert aux tests.
- Webhooks idempotents (`stripe_webhook_events`) → `subscriptions`, `invoices`, `subscription_events` (historique affiché dans l'admin) et événements `billing.subscription_changed` / `billing.payment_failed` (notification + email au parent ou au responsable partenaire).
- **Codes** : remise (`percent`, `amount`, appliquée au paiement), mois offerts (`free_months`) et licences payées par un partenaire (`sponsored`, ex. CSE ou mairie), avec compteur verrouillé en transaction.
- `EntitlementsService` applique les limites partout (enfants, activités personnalisées, co-parents, lieux, offres actives, ciblage). **Une baisse de plan ne supprime rien** : les profils au-delà passent en lecture seule.
- Indicateurs : MRR familles / partenaires, conversion gratuit → payant, churn mensuel, paiements échoués.

## 11. Partenaires v2

- **Réseau enseigne → magasins** (`parent_partner_id`) : l'enseigne crée ses magasins (chacun avec son responsable invité), valide leurs offres locales (`pending_brand`) avant la modération Rekonect, et voit leurs statistiques. Les magasins héritent du plan de l'enseigne.
- **Rôles** : `owner` (admin), `editor`, `viewer`, `reception` (caisse / accueil : validation des bons uniquement).
- **Lieux** (`partner_places`) géolocalisés (géocodage Base adresse nationale dans le portail).
- **Ciblage** : national (familles « premium » uniquement), rayon autour d'un lieu, codes postaux, code d'accès (CSE, mairie). Éligibilité calculée côté serveur : consentement + plan + zone + âge.
- **Déclencheurs** : points (récompense enfant), N activités d'une catégorie ou d'une activité sur une fenêtre de jours, série de jours d'affilée, niveau atteint, objectif familial. Une récompense enfant peut aussi s'obtenir « après des activités », sans dépenser de points.
- **Codes** : code RK généré par Rekonect (`RKxx-xxxx`, encodé dans un QR code `rekonect:voucher:…`), code générique ou réserve de codes uniques importée. Vérification en caisse par saisie, douchette ou caméra ; panier déclaré facultatif.
- **Anonymat** : aucun volume inférieur à 10 n'est affiché ; les audiences sont arrondies à la dizaine et masquées sous 20 familles.
- **Visuels** : téléversés dans Postgres (`media_files`, 2 Mo, PNG/JPEG/WebP vérifiés sur leur contenu), servis par `GET /v1/media/:id`.

## 12. Apps web livrées

| App | Port | Écrans |
|---|---|---|
| `apps/admin` | 3001 | Vue d'ensemble (alertes, KPI, familles actives par mois, plans, top activités/récompenses, santé) · Activités (filtres, fiche éditable, import CSV, signalements) · Récompenses (natives + modération des offres) · Familles (filtres, export CSV, fiche, mois offerts, historique de paiement, suspension, suppression RGPD) · Plans & abonnements (plans, événements, codes promo) · Partenaires (invitation, statut) · recherche ⌘K |
| `apps/partners` | 3002 | Tableau de bord (KPI, entonnoir, déclencheurs) · Offres (filtres, cartes, validation des offres magasins) · Nouvelle offre / édition (5 étapes, aperçu téléphone, audience estimée en direct, visuel) · Audience & zones · Lieux / Magasins / Équipements / Sites · Bons & échanges (caisse + export CSV) · Compte & facturation (plan, équipe, factures) · invitation, connexion, mot de passe oublié |

Composants et jetons dans `packages/ui` (valeurs exactes des maquettes, police Manrope embarquée). Sessions : jeton d'accès court + refresh rotatif stocké côté navigateur, rafraîchi automatiquement.

## 13. Alignements de l'app mobile

- Client `src/lib/api.ts` : appelle l'API NestJS avec le jeton Supabase existant (pont de migration, variable `SUPABASE_JWT_SECRET` côté API).
- **Mon abonnement** (`/parent/subscription`) : plan, limites utilisées, choix de plan mensuel/annuel via Stripe Checkout, portail de paiement, résiliation et reprise, code CSE/mairie, factures. Retour de paiement par lien profond `rekonect://parent/subscription?checkout=success`.
- **Bons & avantages** (`/parent/vouchers`, `/parent/offers/:id` depuis la notification) : portefeuille des bons avec QR code, progression des bons en cours, activation du consentement avec code postal.
- Préférence « Avantages partenaires » dans les préférences de notification ; **« Signaler cette activité »** sur les cartes de validation.

## 14. Lancer le projet en local

```bash
pnpm install
pnpm db:up                                   # Postgres 16 (docker compose)
cp apps/api/.env.example apps/api/.env       # renseigner JWT_ACCESS_SECRET, STRIPE_*, SUPABASE_JWT_SECRET…
pnpm db:migrate && pnpm db:seed
pnpm --filter @rekonect/api dev              # API :3000
pnpm --filter @rekonect/api dev:worker       # worker (outbox, notifications, crons) avec RUN_JOBS=true
pnpm --filter @rekonect/api demo:data        # jeu de démonstration (mot de passe : rekonect-demo-2026)
pnpm dev:admin                               # http://localhost:3001  — admin@rekonect.app
pnpm dev:partners                            # http://localhost:3002  — julie.bernard@decathlonfrance.fr
pnpm --filter @rekonect/e2e e2e              # parcours Playwright (API, worker et apps démarrés)
```

Sur la base Supabase existante : `pnpm --filter @rekonect/api prisma:resolve-baseline` une seule fois, puis `pnpm db:migrate`.

## 15. Décisions produit prises pendant la réalisation

- Consentement aux offres partenaires **désactivé par défaut** ; l'éligibilité d'une famille n'est jamais calculée côté partenaire.
- Offres **nationales réservées aux familles Famille+** (« offres partenaires premium ») ; le plan gratuit voit les offres locales.
- Baisse de plan : **lecture seule** au-delà des limites, jamais de suppression.
- Trois signalements ouverts sur une activité du catalogue la passent en « Signalée ».
- Les âges du catalogue importé (tous 9–14 ans) doivent être revus éditorialement ; le filtrage par âge du catalogue natif est derrière `CATALOG_AGE_FILTER`.

## 16. Prochaine étape à cadrer : bons personnalisables

Les récompenses partenaires sont déjà remises sous forme de bons avec QR code, dans un portefeuille côté parent. À cadrer ensuite : éditeur de bon côté partenaire (modèle, couleurs, logo, accroche, valeur, conditions), rendu du bon unique par famille, place du bon côté enfant (affichage sans code, remise par le parent), expiration et rappel avant expiration.

---

## 17. Notifications v3 : emails automatiques, relances d'encouragement, un seul moteur

### Un seul moteur, quel que soit le chemin d'écriture
- **Seule l'API crée des notifications.** Un garde-fou sur la table `notifications` (migration `20260925000000_notifications_v3`) ignore toute insertion qui ne vient pas de `NotificationService` (marqueur `rekonect.notifications = 'api'` posé le temps de l'écriture). Les anciens triggers SQL, `pg_cron` et l'envoi push via `pg_net` ne peuvent donc plus doubler les notifications. L'app mobile peut toujours marquer lu / non lu ou supprimer.
- **Pont Supabase → outbox.** Tant que l'app mobile écrit certaines tables via supabase-js, ces écritures (reconnues au jeton Supabase de la requête PostgREST) publient les mêmes événements que l'API : `activity.submitted/validated/…`, `reward.*`, `friend.requested`, `duo.*`, `ritual.*`, `child.created`, `child.device_linked`, `family.*`, `user.registered` (compte créé par Supabase Auth). Notifications, emails, **bons partenaires** et objectifs familiaux réagissent donc pareil, que l'action vienne de l'API ou de Supabase.
- Les anciens triggers qui versent des points (duo, rituel) ne tournent plus que pour les écritures Supabase : quand l'API écrit, elle verse elle-même les points (plus de double comptage).
- Les tâches `pg_cron` « deconnect_* » sont retirées ; le worker NestJS les exécute.

### Emails automatiques (51 modèles)
- Catalogue unique (`platform/mail/catalog.ts`), mise en page à la charte (`layout.ts`), version texte systématique, préheader, une action principale.
- **File persistante** `email_messages` : écrite dans la transaction métier (pas d'email pour une action annulée), idempotente (`dedup_key`), reprises 1 min → 6 h sur erreur temporaire, journal consultable.
- **Désinscription par catégorie** (lien signé + `List-Unsubscribe` en un clic) pour les bilans, bons et conseils ; jamais pour la sécurité, le compte ou la facturation. Côté parent, le canal email et les préférences (résumé hebdo, conseils) sont respectés.
- Parents (20) : bienvenue, profil enfant, appareil relié, invitation et arrivée d'un co-parent, première activité, récompense en attente 48 h, bilans hebdo et mensuel, bon partenaire obtenu / qui expire, abonnement (démarré, changé, résilié, fin d'essai), paiement refusé / régularisé, relance douce après 14 jours sans activité (1 par mois au plus), suppression de compte, sécurité (réinitialisation, mot de passe modifié, nouvelle connexion).
- Partenaires (23) : invitation, bienvenue, membre arrivé, rôle changé, accès retiré, compte suspendu / réactivé, offre soumise / publiée / à revoir, offre qui se termine / terminée, stock bas / épuisé, premier bon utilisé, caps (10, 50, 100… bons), bilans hebdo et mensuel (vues, bons obtenus, utilisés, panier moyen, offre la plus demandée), configuration incomplète, aucune offre en ligne, abonnement, fin d'essai, paiement refusé, facture disponible.
- Équipe Rekonect (5) : offre à relire, activité signalée, paiement partenaire refusé, partenaire activé, point du jour.
- Galerie de relecture : `pnpm --filter @rekonect/api email:gallery sortie.html`.

### Relances d'encouragement (push)
Moteur `EngagementService`, exécuté toutes les heures ; chaque famille est traitée à son heure locale (enfant : 16 h en semaine, 10 h le week-end ; parent : 18 h). Pour chaque enfant, **une seule relance, la plus utile** :
1. série à protéger (« Ta série de 4 jours t'attend ») ;
2. activité commencée la veille (« Tu avais commencé Lire 20 pages. Tu veux reprendre ? ») ;
3. récompense proche (il manque ≤ 25 % des points) ;
4. objectif familial de la semaine presque atteint ;
5. activité favorite délaissée depuis 10 jours (« Ça fait 12 jours que tu n'as pas fait Vélo ») ;
6. pause suggérée après 3 jours sans activité, avec une idée courte adaptée à l'âge.

Garde-fous : **1 par jour, 4 par semaine**, rien si l'enfant a déjà agi ou a une activité prévue ce jour-là, rien pendant les heures silencieuses (pas de report au lendemain), préférence « Encouragements » (parent et enfant). Ton selon l'âge (petits / enfants / ados), jamais culpabilisant. Les caps de série (3, 7, 14, 21, 30, 50, 100 jours) sont fêtés à la validation (push enfant, in-app parent).

Côté parent : activités en attente de validation depuis la veille (1 par jour), enfant sans activité depuis 5 jours avec une idée concrète (2 par semaine au plus).

### Restent côté app (jusqu'à la phase 2)
L'alerte « mot de passe modifié » et « nouvelle connexion » des comptes Supabase Auth restent envoyées par l'app : le serveur ne voit pas ces événements tant que l'authentification n'est pas passée sur l'API. Les emails de bienvenue, de profil enfant et « activité envoyée » ne partent plus de l'app.

---

## 18. Scripts de livraison et de mise à jour

Réglages personnels (clé App Store Connect, Firebase) : copier `.release.env.example` en `~/.rekonect/release.env`. L'URL de l'API et les clés Supabase de l'app vont dans `apps/mobile/.env.production.local` (Vite ne lit pas le `.env` de la racine ; le script recopie les clés `VITE_*` s'il les y trouve).

| Commande | Rôle |
|---|---|
| `pnpm resync` (`./scripts/resync.sh`) | Récupère le code (paquet `.transfer` ou `origin`), `pnpm install`, construit les paquets partagés, génère Prisma, marque la baseline sur une ancienne base Supabase, sauvegarde (`pg_dump`) puis applique les migrations, construit l'API. Options : `--stash`, `--seed`, `--check`, `--mobile`, `--yes`. |
| `pnpm release:testflight` (`./scripts/testflight.sh`) | Vérifie clé ASC, état git et URL d'API, incrémente le build (`version.json`), archive, exporte, valide et envoie sur App Store Connect. `--dry-run` pour ne vérifier que la configuration. |
| `pnpm release:firebase [android\|ios\|all]` (`./scripts/firebase.sh`) | Même préparation, puis APK (et/ou IPA « release-testing ») envoyés aux testeurs Firebase App Distribution avec les derniers commits en notes. |

Les deux scripts de livraison refusent une API locale ou non HTTPS (le téléphone d'un testeur ne la joindrait pas), sauf `--allow-local-api`, et refusent de livrer des modifications non commitées, sauf `--allow-dirty`.
