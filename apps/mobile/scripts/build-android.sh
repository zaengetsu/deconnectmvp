#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Deconnect — Build Android
# Usage: ./scripts/build-android.sh [--distribute|--release] [--upload-play]
#
#   (sans argument)  APK debug + install sur émulateur/device connecté
#   --distribute     APK debug distribué via Firebase App Distribution
#   --release        AAB signé (Google Play) → build/android/Rekonect-<date>.aab
#   --release --upload-play
#                    …puis envoi sur la piste interne via fastlane supply
#
# Signature release (obligatoire pour --release) :
#   ANDROID_KEYSTORE        chemin du .jks (défaut ~/.android/rekonect-release.jks)
#   ANDROID_KEYSTORE_PASS   mot de passe du keystore
#   ANDROID_KEY_ALIAS       alias de la clé (défaut rekonect)
#   ANDROID_KEY_PASS        mot de passe de la clé (défaut = celui du keystore)
#
# Upload Play (--upload-play) :
#   GOOGLE_PLAY_JSON_KEY    compte de service Play Console (.json)
#   Le tout premier AAB d'une app doit être déposé à la main dans la
#   Play Console : l'API refuse la création de la fiche.
#
# ⚠️  Le chemin --release n'a jamais été exécuté sur la machine de dev
#     (ni JDK ni SDK Android installés au 19/08/2026).
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FIREBASE_APP_ID="1:410630450375:android:f012e7c0ddc7b92a21a2e2"
TESTERS="leonceyopa@gmail.com,stella.berthier@yahoo.fr,i.berthier@wineor.fr"

cd "$PROJECT_DIR"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib-release.sh"
use_project_node

MODE="debug"
UPLOAD_PLAY=0
for arg in "$@"; do
  case "$arg" in
    --distribute)  MODE="distribute" ;;
    --release)     MODE="release" ;;
    --upload-play) UPLOAD_PLAY=1 ;;
  esac
done

# ─── Prérequis ────────────────────────────────────────────────
if ! node_version_ok; then
  echo "❌ Node ^20.19 ou >=22.12 requis (trouvé : $(node --version))." >&2
  echo "   nvm install $(cat .nvmrc 2>/dev/null || echo 22)" >&2
  exit 1
fi

if ! /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  echo "❌ JDK 17 introuvable — requis par le plugin Android Gradle." >&2
  echo "   brew install --cask temurin@17" >&2
  exit 1
fi
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -d "$ANDROID_HOME" ]; then
  echo "❌ SDK Android introuvable dans $ANDROID_HOME." >&2
  echo "   brew install --cask android-commandlinetools   puis :" >&2
  echo "   sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'" >&2
  exit 1
fi
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

# ─── Build web + projet natif ─────────────────────────────────
echo "🔨 Building web assets..."
npm run build

if [ ! -d android ]; then
  echo "📱 Génération du projet natif Android (npx cap add android)..."
  npx cap add android
fi

echo "🤖 Syncing Capacitor Android..."
npx cap sync android

# version.json fait foi (android/ est gitignoré, donc régénérable)
apply_android_version

# ─── Release : AAB signé pour Google Play ─────────────────────
if [ "$MODE" = "release" ]; then
  KEYSTORE="${ANDROID_KEYSTORE:-$HOME/.android/rekonect-release.jks}"
  KEY_ALIAS="${ANDROID_KEY_ALIAS:-rekonect}"
  KEY_PASS="${ANDROID_KEY_PASS:-$ANDROID_KEYSTORE_PASS}"

  if [ ! -f "$KEYSTORE" ]; then
    echo "❌ Keystore de release introuvable : $KEYSTORE" >&2
    echo "   Google Play refuse un AAB non signé. Créer la clé (à conserver," >&2
    echo "   sa perte interdit toute mise à jour ultérieure de l'app) :" >&2
    echo "     keytool -genkeypair -v -keystore $KEYSTORE \\" >&2
    echo "       -alias $KEY_ALIAS -keyalg RSA -keysize 2048 -validity 10000" >&2
    exit 1
  fi
  [ -n "${ANDROID_KEYSTORE_PASS:-}" ] || { echo "❌ ANDROID_KEYSTORE_PASS non défini." >&2; exit 1; }

  OUT_DIR="build/android"
  mkdir -p "$OUT_DIR"

  echo "📦 Build AAB release signé..."
  (cd android && ./gradlew bundleRelease \
    -Pandroid.injected.signing.store.file="$KEYSTORE" \
    -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASS" \
    -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$KEY_PASS" | tail -5)

  RAW_AAB="android/app/build/outputs/bundle/release/app-release.aab"
  [ -f "$RAW_AAB" ] || { echo "❌ AAB introuvable : $RAW_AAB" >&2; exit 1; }
  AAB_PATH="$OUT_DIR/Rekonect-$(date +%Y%m%d-%H%M).aab"
  cp "$RAW_AAB" "$AAB_PATH"

  echo ""
  echo "✅ Build Android release terminé"
  echo "📁 AAB : $AAB_PATH"

  if [ "$UPLOAD_PLAY" = 1 ]; then
    [ -n "${GOOGLE_PLAY_JSON_KEY:-}" ] || {
      echo "❌ GOOGLE_PLAY_JSON_KEY (compte de service Play Console) non défini." >&2; exit 1; }
    command -v fastlane >/dev/null 2>&1 || {
      echo "❌ fastlane introuvable (brew install fastlane)." >&2; exit 1; }
    echo "🚀 Envoi sur la piste interne Google Play..."
    fastlane supply \
      --package_name ceo.services.rekonect \
      --aab "$AAB_PATH" \
      --json_key "$GOOGLE_PLAY_JSON_KEY" \
      --track internal \
      --skip_upload_metadata true \
      --skip_upload_images true \
      --skip_upload_screenshots true
    echo "✅ AAB envoyé sur la piste interne"
  else
    echo ""
    echo "Pour publier sur la piste interne :"
    echo "  GOOGLE_PLAY_JSON_KEY=<compte-de-service.json> \\"
    echo "    ./scripts/build-android.sh --release --upload-play"
    echo "  (ou dépôt manuel dans la Play Console — obligatoire au 1er AAB)"
  fi
  exit 0
fi

# ─── Debug : APK ──────────────────────────────────────────────
echo "📦 Building APK..."
(cd android && ./gradlew assembleDebug | tail -3)

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ "$MODE" = "distribute" ]; then
  command -v firebase >/dev/null 2>&1 || {
    echo "❌ firebase-tools introuvable (npm i -g firebase-tools)." >&2; exit 1; }
  echo "🚀 Distributing via Firebase App Distribution..."
  firebase appdistribution:distribute \
    "$APK_PATH" \
    --app "$FIREBASE_APP_ID" \
    --testers "$TESTERS" \
    --release-notes "Deconnect beta — $(date '+%d/%m/%Y %H:%M')"
  echo ""
  echo "✅ APK distribué aux testeurs"
else
  if adb devices 2>/dev/null | grep -q "device$"; then
    echo "📲 Installing on connected device/emulator..."
    adb install -r "$APK_PATH"
    adb shell am start -n ceo.services.rekonect/.MainActivity
    echo "✅ App installée et lancée"
  else
    echo "ℹ️  Aucun device/émulateur connecté."
    echo "   Pour lancer l'émulateur : emulator -avd Pixel8_API34 &"
    echo "   Pour installer : adb install -r $APK_PATH"
  fi
fi

echo ""
echo "✅ Build Android terminé"
echo "📁 APK : $APK_PATH"
