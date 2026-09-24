# Rekonect — Architecture cible

**Statut :** v1 — 24 septembre 2026
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
  packages/api-client┤ client HTTP typé (web + mobile)                                 │
  packages/ui-tokens ┤ jetons du design system Rekonect (couleurs, rayons, typo)       │
  packages/config    ┤ tsconfig / eslint partagés                                      │
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
| 0 | Monorepo Turborepo · API NestJS · Prisma sur le schéma existant · outbox · notifications · partenaires · apps admin et partenaires | **en cours (cette livraison)** |
| 1 | L'app mobile passe de `supabase-js` à `@rekonect/api-client`, écran par écran (≈ 60 appels `.from()` et 9 RPC à remplacer) | à faire |
| 2 | Import des comptes (`auth.users` → `users`), bascule de l'auth mobile, suppression de Supabase Auth | à faire |
| 3 | Désactivation des triggers, crons (`pg_cron`) et Edge Functions Supabase, remplacés par le worker | à faire |
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

## 9. Inventaire des écrans web : brief pour le design

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
