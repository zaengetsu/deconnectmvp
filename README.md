# 📵 Deconnect MVP

**Deconnect** est une application mobile de contrôle parental axée sur la réduction du temps d'écran. Elle permet aux parents de superviser et limiter l'usage des appareils de leurs enfants, tout en gamifiant la déconnexion pour encourager de bonnes habitudes numériques.

---

## ✨ Fonctionnalités principales

| Profil | Fonctionnalités |
|---|---|
| **Parent** | Tableau de bord de supervision, gestion des enfants, définition des plages horaires, catalogue d'activités, système de récompenses |
| **Enfant** | Tracker hebdomadaire, défis & gamification, catalogue d'activités alternatives, notifications |
| **Commun** | Authentification Supabase, liaison parent↔enfant par QR code, push notifications, splash screen natif |

---

## 🛠 Stack technique

### Frontend
| Technologie | Rôle |
|---|---|
| **React 19** | Framework UI |
| **TypeScript 6** | Typage statique |
| **Vite 8** | Bundler & dev server |
| **Ionic React 8** | Composants UI mobile-first |
| **TailwindCSS 4** | Utilitaires CSS |
| **Lucide React** | Iconographie |

### State & Formulaires
| Technologie | Rôle |
|---|---|
| **Zustand 5** | Gestion d'état global |
| **React Hook Form 7** | Gestion des formulaires |
| **Zod 4** | Validation des schémas |

### Backend & Data
| Technologie | Rôle |
|---|---|
| **Supabase** | Base de données PostgreSQL, Auth, Storage |
| `@supabase/supabase-js` | Client SDK |

### Mobile natif
| Technologie | Rôle |
|---|---|
| **Capacitor 6** | Bridge web → natif iOS/Android |
| `@capacitor/push-notifications` | Notifications push |
| `@capacitor/preferences` | Stockage local natif |
| `@capacitor/splash-screen` | Écran de démarrage |
| `@capacitor/status-bar` | Barre de statut native |

### Tooling
| Technologie | Rôle |
|---|---|
| **Vitest** | Tests unitaires |
| **Testing Library** | Tests de composants |
| **ESLint** | Linting TypeScript/React |

---

## 🚀 Démarrage rapide (web)

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env
# → Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 3. Lancer le serveur de développement
npm run dev
```

L'app est accessible sur `http://localhost:5173`.

---

## ⚡ Scripts tout-en-un (`install.sh` / `build.sh` / `run.sh`)

Trois scripts à la racine automatisent toute la chaîne iOS (et délèguent à
`scripts/build-android.sh` pour Android). C'est la méthode recommandée.

### `./install.sh` — préparer l'environnement iOS

Idempotent, relançable sans risque. Vérifie Xcode et sa licence, Node ≥ 20,
installe les dépendances JS (pnpm ou npm), répare/installe CocoaPods via
Homebrew si besoin, build le web, génère le projet natif `ios/` (`cap add ios`)
et exécute `pod install`.

```bash
./install.sh
```

### `./build.sh` — produire l'IPA

```bash
./build.sh                        # = ./build.sh ios → IPA dans build/ios/Rekonect-<date>.ipa
./build.sh ios --open             # build + sync + ouvre Xcode (archivage manuel)
./build.sh ios --method debugging # IPA de dev (devices provisionnés)
                                  # methods : app-store-connect (défaut),
                                  #           release-testing, debugging
./build.sh ios --upload           # archive + upload direct sur App Store Connect (TestFlight)
./build.sh android [...]          # délègue à scripts/build-android.sh
```

Variables utiles : `TEAM_ID` (team Apple, défaut `D72UK7R5RE`), `SCHEME`,
et pour la CI sans session Xcode : `ASC_KEY_PATH` / `ASC_KEY_ID` / `ASC_ISSUER_ID`
(clé API App Store Connect `.p8`).

> ⚠️ L'archive IPA nécessite un compte Apple accessible par `xcodebuild` :
> Xcode → Settings → Accounts (ou la clé API ci-dessus). Le run simulateur, lui,
> ne demande aucune signature.

### `./run.sh` — lancer l'app

```bash
./run.sh                     # = ./run.sh ios → installe si besoin, build,
                             #   et lance sur un simulateur disponible
                             #   (réutilise un simulateur déjà démarré)
./run.sh ios --device        # lance sur le premier iPhone/iPad branché (USB/WiFi)
./run.sh ios --target <UDID> # cible précise (simulateur ou device)
./run.sh android [...]       # délègue à scripts/build-android.sh
```

`build.sh` et `run.sh` lancent automatiquement `./install.sh` si `ios/` ou
`node_modules/` manquent. Détails et dépannage : voir [DEV_MOBILE.md](DEV_MOBILE.md).

---

## 📱 Build & lancement sur iOS (Capacitor) — méthode manuelle

> **Prérequis :** macOS + Xcode installé + compte Apple Developer (pour device réel)

```bash
# 1. Build de l'app web
npm run build

# 2. Synchroniser les fichiers natifs Capacitor
npm run cap:sync
# ou : npx cap sync

# 3. Ouvrir le projet dans Xcode
npx cap open ios
```

Dans **Xcode** :
1. Sélectionner un simulateur ou un device physique en haut à gauche.
2. Cliquer sur **▶ Run** (ou `Cmd + R`).

> **Live reload (dev)** : Décommenter le bloc `server.url` dans `capacitor.config.ts` en remplaçant l'IP par celle de votre machine sur le réseau local, puis relancer `npm run cap:sync`.

---

## 🤖 Build & lancement sur Android (Capacitor)

> **Prérequis :** Android Studio installé + JDK 17+ + un émulateur ou device USB configuré

```bash
# 1. Build de l'app web
npm run build

# 2. Synchroniser les fichiers natifs Capacitor
npm run cap:sync
# ou : npx cap sync

# 3. Ouvrir le projet dans Android Studio
npx cap open android
```

Dans **Android Studio** :
1. Laisser Gradle terminer la synchronisation.
2. Sélectionner un émulateur ou device dans la liste déroulante.
3. Cliquer sur **▶ Run** (ou `Shift + F10`).

> **Débogage WebView Android** : Dans `capacitor.config.ts`, passer `webContentsDebuggingEnabled` à `true` puis inspecter via `chrome://inspect`.

---

## 📋 Scripts disponibles

```bash
npm run dev            # Serveur de développement Vite
npm run build          # Build de production (TypeScript + Vite)
npm run preview        # Prévisualisation du build
npm run lint           # Lint ESLint
npm run test           # Tests unitaires (vitest run)
npm run test:watch     # Tests en mode watch
npm run test:coverage  # Rapport de couverture
npm run cap:sync       # Synchronisation Capacitor (web → natif)

./install.sh           # Prérequis iOS (deps, CocoaPods, projet natif)
./build.sh             # Build iOS → IPA (défaut) | ./build.sh android
./run.sh               # Run sur simulateur iOS | --device pour iPhone réel
```

---

## 🗂 Structure du projet

```
deconnectmvp/
├── android/              # Projet natif Android (Capacitor)
├── ios/                  # Projet natif iOS (Capacitor)
├── src/
│   ├── components/       # Composants UI réutilisables
│   ├── features/         # Modules fonctionnels
│   │   ├── activities/   # Catalogue d'activités alternatives
│   │   ├── children/     # Gestion des profils enfants
│   │   ├── gamification/ # Défis & points
│   │   ├── notifications/# Push notifications
│   │   ├── rewards/      # Système de récompenses
│   │   └── storage/      # Persistance locale
│   ├── hooks/            # Hooks React personnalisés
│   ├── lib/              # Config Supabase & utilitaires
│   ├── pages/
│   │   ├── child/        # Interface enfant
│   │   ├── parent/       # Interface parent
│   │   └── public/       # Auth & onboarding
│   ├── stores/           # État global Zustand
│   └── types/            # Types TypeScript partagés
├── supabase/             # Migrations & seeds SQL
├── capacitor.config.ts   # Configuration Capacitor
└── vite.config.ts        # Configuration Vite
```

---

## 🔑 Variables d'environnement

Créer un fichier `.env` à la racine à partir de `.env.example` :

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> ⚠️ Ne jamais committer le fichier `.env`. Il est listé dans `.gitignore`.

---

## 🧪 Tests

```bash
npm run test            # Exécution unique
npm run test:watch      # Mode watch (développement)
npm run test:coverage   # Rapport de couverture HTML
```

Les tests utilisent **Vitest** + **Testing Library** + **jsdom** + **MSW** pour le mocking des requêtes réseau.
