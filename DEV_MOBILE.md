# Deconnect — Guide de développement mobile

## 🚀 Scripts racine (démarrage rapide)

```bash
./install.sh              # installe tout le nécessaire iOS (idempotent) :
                          # Xcode check, deps JS, CocoaPods, cap add ios, pod install

./build.sh                # = ./build.sh ios → archive Release + export IPA
                          #   → build/ios/Rekonect-<date>.ipa
./build.sh ios --open     # build + sync + ouvre Xcode (archivage manuel)
ASC_KEY_ID=<id> ASC_ISSUER_ID=<uuid> ./build.sh ios --upload
                          # archive + valide + uploade sur App Store Connect
./build.sh ios --method debugging   # IPA de dev (devices provisionnés)
./build.sh android        # délègue à scripts/build-android.sh

./run.sh                  # = ./run.sh ios → install si besoin + build +
                          #   lance sur un simulateur dispo (réutilise un simu démarré)
./run.sh ios --device     # lance sur le premier iPhone/iPad branché en USB
./run.sh ios --target <UDID>        # cible précise
./run.sh android          # délègue à scripts/build-android.sh
```

`build.sh` et `run.sh` lancent automatiquement `./install.sh` si `ios/` ou
`node_modules/` manquent. Team ID surchargeable : `TEAM_ID=XXXX ./build.sh`.

### Signature et upload

L'app est signée avec la team **`D72UK7R5RE`** (Jacques Charles NDJANDA MBIADA),
bundle id `ceo.services.rekonect`. `install.sh` inscrit cette team dans
`project.pbxproj` — nécessaire car `ios/` est gitignoré et donc régénérable.

Sans compte Apple connecté dans Xcode, la signature « cloud » à l'export échoue
(`Cloud signing permission error`). `build.sh` bascule alors automatiquement sur
une **signature manuelle** avec le profil App Store installé localement
(`PROFILE`, défaut `Rekonect_AppStore`), et l'upload passe par
`xcrun altool` + clé API (`ASC_KEY_ID` / `ASC_ISSUER_ID`, le `.p8` étant
retrouvé dans `~/.private_keys` ou `~/.appstoreconnect/private_keys`).

⚠️ **Build number** : incrémenter `CURRENT_PROJECT_VERSION` dans
`ios/App/App.xcodeproj/project.pbxproj` avant chaque upload — App Store Connect
rejette deux builds portant le même numéro pour une même version marketing.

Le run simulateur, lui, n'exige aucune signature.

## Prérequis

| Outil | Version | Notes |
|-------|---------|-------|
| Node.js | 18+ | |
| Java (Temurin) | 17 | Gradle nécessite Java 17 (pas 26) |
| Android SDK | API 34 | `~/Library/Android/sdk` |
| Xcode | 15+ | Pour iOS |
| CocoaPods | 1.16+ | `brew install cocoapods` |

## Variables d'environnement

Ajouter dans `~/.zshrc` :

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

Puis `source ~/.zshrc`.

---

## Architecture Capacitor

Capacitor est le pont entre l'app web (Ionic/React) et les plateformes natives (iOS/Android).

```
src/          → Code source React/TypeScript
    ↓ npm run build
dist/         → Bundle web optimisé
    ↓ npx cap sync [ios|android]
ios/App/      → Projet Xcode natif (contient dist/ copié dans le WebView)
android/      → Projet Gradle natif (contient dist/ copié dans le WebView)
```

**Cycle de développement :**
1. Modifier le code dans `src/`
2. `npm run build` → génère `dist/`
3. `npx cap sync ios` ou `npx cap sync android` → copie `dist/` dans le projet natif + met à jour les plugins
4. Build natif (Xcode ou Gradle) → génère l'app installable

---

## 🍎 iOS

### Script rapide

```bash
# Build + ouvre Xcode
./scripts/build-ios.sh

# Build + archive CLI (sans ouvrir Xcode)
./scripts/build-ios.sh --archive
```

### Étape par étape

```bash
# 1. Build web
npm run build

# 2. Sync avec le projet Xcode natif
npx cap sync ios

# 3. Ouvrir Xcode
npx cap open ios
```

### Archiver pour TestFlight (dans Xcode)

1. En haut : sélectionner **"Any iOS Device (arm64)"** (⚠️ pas un simulateur)
2. **Product** → **Archive** (attend ~2-3 min)
3. Organizer → **Distribute App** → **TestFlight & App Store** → **Upload**

### Archiver pour TestFlight (en CLI)

```bash
# Archive
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -sdk iphoneos \
  -configuration Release \
  -archivePath /tmp/Deconnect.xcarchive \
  archive \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=D72UK7R5RE

# Export + upload
xcodebuild -exportArchive \
  -archivePath /tmp/Deconnect.xcarchive \
  -exportPath /tmp/DeconnectExport \
  -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates
```

### Lancer sur simulateur

```bash
npm run build && npx cap sync ios && npx cap run ios
```

### Lancer sur iPhone (USB)

```bash
npm run build && npx cap sync ios && npx cap run ios --target <DEVICE_ID>
# Pour lister les devices : xcrun xctrace list devices
```

---

## 🤖 Android

### Script rapide

```bash
# Build + install sur émulateur
./scripts/build-android.sh

# Build + distribuer via Firebase
./scripts/build-android.sh --distribute
```

### Étape par étape

```bash
# 1. Configurer Java 17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# 2. Build web
npm run build

# 3. Sync avec le projet Android natif
npx cap sync android

# 4. Build l'APK
cd android && ./gradlew assembleDebug && cd ..

# 5. L'APK est ici :
#    android/app/build/outputs/apk/debug/app-debug.apk
```

### Émulateur Android

```bash
# Lancer l'émulateur
emulator -avd Pixel8_API34 &

# Attendre le boot (~30-60s) puis installer
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Lancer l'app
adb shell am start -n ceo.services.rekonect/.MainActivity
```

### Commande tout-en-un (Capacitor)

```bash
npm run build && npx cap sync android && npx cap run android
```

---

## 📦 Distribution

### iOS → TestFlight

Nécessite un compte Apple Developer Program (99$/an).
Voir la section "Archiver pour TestFlight" ci-dessus.

Ajouter les testeurs sur [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → TestFlight.

### Android → Firebase App Distribution (gratuit)

```bash
# Distribuer avec le script
./scripts/build-android.sh --distribute

# Ou manuellement
firebase appdistribution:distribute \
  android/app/build/outputs/apk/debug/app-debug.apk \
  --app "1:410630450375:android:f012e7c0ddc7b92a21a2e2" \
  --testers "email1@test.com,email2@test.com" \
  --release-notes "Description du build"
```

### Android → APK direct

Envoyer le fichier `android/app/build/outputs/apk/debug/app-debug.apk` par email/WhatsApp.
Le testeur devra activer "Sources inconnues" dans les paramètres Android.

---

## 🔧 Dépannage

| Problème | Solution |
|----------|----------|
| `Unsupported class file major version` | `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` |
| `adb: no devices` | Lancer l'émulateur : `emulator -avd Pixel8_API34 &` |
| `SDK location not found` | Vérifier `android/local.properties` contient `sdk.dir` |
| Crash Android push notifications | Vérifier que `android/app/google-services.json` existe |
| `pod install` échoue | `cd ios/App && pod install --repo-update` |
| Android Studio crash macOS 14 | Bug connu. Utiliser le terminal à la place (tout est en CLI) |

---

## 📁 Fichiers clés

| Fichier | Description |
|---------|-------------|
| `capacitor.config.ts` | Config Capacitor (appId, plugins, serveur) |
| `android/app/google-services.json` | Config Firebase pour push Android |
| `ios/ExportOptions.plist` | Options d'export pour archive iOS |
| `scripts/build-ios.sh` | Script build iOS |
| `scripts/build-android.sh` | Script build Android |
| `android/app/src/main/AndroidManifest.xml` | Permissions Android |
| `ios/App/App/Info.plist` | Config iOS |
