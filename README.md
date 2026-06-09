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

## 📱 Build & lancement sur iOS (Capacitor)

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
