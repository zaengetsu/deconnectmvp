# Données personnelles de l'app Rekonect — inventaire et réponses App Store

Sert de base à la politique de confidentialité publiée sur `/confidentialite` (portail partenaires) et aux questionnaires d'App Store Connect (« Confidentialité de l'app », « Classification par âge »).

Légende : **[vérifié]** = lu dans le code ou le schéma (`apps/api/prisma/schema.prisma`, modules NestJS, `apps/mobile/package.json`) ; **[déduit]** = interprétation ou usage probable, à confirmer.

## 1. Inventaire

| Catégorie | Données | Personne | Finalité | Où / sous-traitant |
|---|---|---|---|---|
| Compte | email, nom complet, mot de passe (haché), dates de connexion **[vérifié]** (`users`, `profiles`) | parent, co-parent | création et accès au compte | base Postgres (Supabase, région UE **[déduit : pooler `eu-north-1`]**), API hébergée chez Scaleway `fr-par` **[vérifié]** |
| Profil | pays, ville, code postal, région, latitude/longitude, emoji d'avatar **[vérifié : colonnes présentes]** | parent | aucune écriture trouvée dans l'API ni l'app actuelles **[vérifié]** — colonnes héritées | Postgres |
| Profil enfant | prénom ou pseudonyme (`display_name`), âge (entier, pas de date de naissance), avatar, code PIN (haché) **[vérifié]** | enfant | personnaliser l'espace enfant, proposer des activités adaptées à l'âge | Postgres |
| Liaison d'appareil | identifiant d'appareil, user-agent, jetons de session (hachés) **[vérifié]** (`refresh_tokens`, `child_link_tokens`) | parent, enfant | sessions et liaison du téléphone de l'enfant | Postgres |
| Activités | activités assignées, statut, dates, points, badges, récompenses demandées **[vérifié]** | enfant (géré par le parent) | cœur du service | Postgres |
| Preuves | photo ou vidéo envoyée par l'enfant (10 Mo max) **[vérifié]** (`media_files.kind = proof`, stockée en base) | enfant | validation de l'activité par le parent | Postgres ; l'enfant peut supprimer sa preuve (`DELETE /child-activities/:id/proof/:mediaId`) **[vérifié]** |
| Temps d'écran | minutes par jour et objectif, **saisis par le parent** (`PUT screen-time`) **[vérifié]** — pas de mesure automatique sur l'appareil | enfant | suivi de l'objectif famille | Postgres |
| Famille | invitations de co-parent (email), rituels, objectifs **[vérifié]** | parents | partage de la gestion | Postgres |
| Social enfant | demandes d'amis entre enfants, approuvées par **les deux parents** ; un ami voit prénom/pseudonyme et avatar **[vérifié]** (`child_friends`, `duo_challenges`) | enfant | défis à deux | Postgres |
| Notifications | jeton push, plateforme, préférences, historique des notifications **[vérifié]** | parent, enfant | rappels et validations | Apple APNs (iOS), Firebase Cloud Messaging (Android) **[vérifié : `@capacitor/push-notifications`, variables APNS_* / FCM_*]** |
| Emails | adresse, contenu des emails transactionnels, événements de délivrance, désinscriptions **[vérifié]** (`email_messages`, `email_events`, `email_suppressions`) | parent, partenaire | emails de service (bienvenue, mot de passe, récapitulatifs) | Brevo **[vérifié]** |
| Paiement | identifiants client et abonnement Stripe, factures (montant, statut, liens) **[vérifié]** — aucune donnée de carte stockée par Rekonect | parent, partenaire | abonnements | Stripe **[vérifié]** |
| Offres partenaires | bons réclamés et codes, rattachés **au parent** (`offer_claims.parent_id`) ; impressions d'offre par clé anonyme et par jour (`offer_impressions.viewer_key`) **[vérifié]** | parent (enfant éventuellement référencé) | remise des bons | Postgres ; le partenaire ne reçoit que des agrégats (≥ 10, arrondis, masqués sous 20 — règle 5 du `CLAUDE.md`) |
| Analytique / publicité | **aucun SDK** d'analytics, de mesure ou de publicité dans `apps/mobile` **[vérifié : package.json]** | — | — | — |

**Suppression du compte** **[vérifié]** : en libre-service dans l'app (Réglages → Mon compte → Supprimer mon compte), via `DELETE /v1/auth/account` confirmé par le mot de passe (règle App Store 5.1.1(v)). Effacement immédiat, identique à celui du back-office (`DELETE /admin/families/:id`) : compte, profil, enfants et tout ce qui en dépend (activités, preuves, points, badges, récompenses, bons, appareils, sessions, jetons push) partent en cascade, puis l'événement `user.account_deleted` fait effacer les notifications (module notifications) et résilier en fin de période les abonnements Stripe (module billing), et l'email `parent.account_deleted` confirme. Les traces laissées chez d'autres familles (activité validée par un co-parent, etc.) sont détachées (clés mises à NULL). Les agrégats partenaires, déjà anonymes, sont conservés. Un co-parent invité ne supprime que son compte et ses rattachements, jamais la famille qui l'a invité. La demande par email reste possible en alternative.

**Durées de conservation** : aucune purge automatique des données personnelles n'est programmée **[vérifié : jobs du worker]** — les durées affichées dans la politique sont **à fixer par la société**.

## 2. Questionnaire « Confidentialité de l'app » (proposition)

- **Suivi (tracking)** : **Non** — pas de SDK publicitaire, pas de partage avec des courtiers de données **[vérifié]**.
- **Données collectées**, toutes **liées à l'identité** de l'utilisateur, aucune utilisée pour le suivi :

| Type Apple | Collecté | Finalités à cocher |
|---|---|---|
| Coordonnées → Adresse email | Oui | Fonctionnalités de l'app |
| Coordonnées → Nom | Oui | Fonctionnalités de l'app |
| Contenu utilisateur → Photos ou vidéos | Oui (preuves) | Fonctionnalités de l'app |
| Contenu utilisateur → Autre contenu | Oui (activités, récompenses, rituels) | Fonctionnalités de l'app |
| Identifiants → Identifiant d'utilisateur | Oui | Fonctionnalités de l'app |
| Identifiants → Identifiant de l'appareil | Oui (liaison du téléphone enfant, jeton push) **[déduit : classement Apple]** | Fonctionnalités de l'app |
| Achats → Historique d'achats | Oui si abonnement (Stripe) | Fonctionnalités de l'app |
| Données d'utilisation → Interactions avec le produit | Oui (impressions d'offres, statistiques d'activité) **[déduit]** | Analyse interne, fonctionnalités de l'app |
| Localisation | **Non** (colonnes présentes mais jamais remplies) **[vérifié]** — à revoir si elles servent un jour | — |
| Diagnostics | **Non** (pas de SDK de crash) **[vérifié]** | — |
| Santé, contacts, navigation, recherche, finances | Non | — |

## 3. Questionnaire de classification par âge (proposition)

- Violence, contenu sexuel, grossièretés, drogues, jeux d'argent, horreur, références médicales : **Aucun**.
- Accès web non restreint : **Non**.
- Contenu généré par les utilisateurs / communication entre utilisateurs : **Oui, limité** — les enfants peuvent devenir « amis » et lancer des défis **avec l'accord des deux parents** ; pas de messagerie libre **[vérifié : pas de module de messages]**.
- Concours / récompenses : récompenses définies par les parents et offres de partenaires modérées.
- Résultat attendu : **4+**. Ne pas cocher la catégorie « Enfants » (Kids Category) sans revue : elle interdit les liens externes et les achats hors contrôle parental, et le compte est tenu par le parent **[déduit]**.
