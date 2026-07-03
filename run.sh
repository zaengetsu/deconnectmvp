#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Deconnect — Run
# Usage: ./run.sh [ios|android] [options]
#
#   ./run.sh                    # = ./run.sh ios → installe si besoin,
#                               #   build et lance sur un simulateur dispo
#                               #   (réutilise un simulateur déjà démarré)
#   ./run.sh ios --device       # lance sur le premier iPhone/iPad branché
#   ./run.sh ios --target <id>  # cible précise (UDID simu ou device)
#   ./run.sh android [...]      # délègue à scripts/build-android.sh
#
# Variables : TEAM_ID (défaut D72UK7R5RE, utilisé pour le run device)
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v brew >/dev/null 2>&1; then
  export PATH="$(brew --prefix)/bin:$PATH"
fi

TEAM_ID="${TEAM_ID:-D72UK7R5RE}"
SCHEME="${SCHEME:-App}"
WORKSPACE="ios/App/App.xcworkspace"

PLATFORM=""
USE_DEVICE=0
TARGET=""
FORWARD_ARGS=""

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    ios|android) PLATFORM="$1" ;;
    --device)    USE_DEVICE=1 ;;
    --target)    TARGET="$2"; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           FORWARD_ARGS="$FORWARD_ARGS $1" ;;
  esac
  shift
done
PLATFORM="${PLATFORM:-ios}"

if [ "$PLATFORM" = "android" ]; then
  # shellcheck disable=SC2086
  exec "$SCRIPT_DIR/scripts/build-android.sh" $FORWARD_ARGS
fi

# ─── Install si besoin ────────────────────────────────────────
if [ ! -d ios ] || [ ! -d node_modules ]; then
  echo "⚙️  Prérequis manquants (ios/ ou node_modules) — lancement de ./install.sh..."
  "$SCRIPT_DIR/install.sh"
fi

if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then PM="pnpm"; else PM="npm"; fi

APP_ID="$(grep -Eo "appId: *'[^']+'" capacitor.config.ts 2>/dev/null | sed "s/.*'\(.*\)'/\1/")"
APP_ID="${APP_ID:-app.deconnect.mvp}"

# ─── Choix de la cible ────────────────────────────────────────
UUID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'
DEVICE_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9a-f]{40}'

if [ -z "$TARGET" ]; then
  if [ "$USE_DEVICE" = 1 ]; then
    echo "🔎 Recherche du premier appareil physique connecté..."
    TARGET="$(xcrun xctrace list devices 2>/dev/null \
      | sed -n '/== Devices ==/,/== Simulators ==/p' \
      | grep -E 'iPhone|iPad' \
      | grep -Eo "$DEVICE_RE" | head -1 || true)"
    [ -n "$TARGET" ] || { echo "❌ Aucun iPhone/iPad détecté. Branchez l'appareil en USB, déverrouillez-le et faites confiance à ce Mac." >&2; exit 1; }
    echo "📱 Appareil : $TARGET"
  else
    echo "🔎 Recherche d'un simulateur..."
    # Simulateur déjà démarré ?
    TARGET="$(xcrun simctl list devices booted | grep -Eo "$UUID_RE" | head -1 || true)"
    if [ -n "$TARGET" ]; then
      echo "📱 Simulateur déjà démarré : $(xcrun simctl list devices booted | grep "$TARGET" | sed 's/(.*//' | xargs)"
    else
      # Sinon premier iPhone disponible
      LINE="$(xcrun simctl list devices available | grep -E '^[[:space:]]+iPhone' | head -1 || true)"
      [ -n "$LINE" ] || { echo "❌ Aucun simulateur iPhone disponible. Ouvrez Xcode → Settings → Components pour installer un runtime iOS." >&2; exit 1; }
      TARGET="$(echo "$LINE" | grep -Eo "$UUID_RE" | head -1)"
      echo "📱 Simulateur : $(echo "$LINE" | sed 's/(.*//' | xargs)"
    fi
  fi
fi

# ─── Build web + sync ─────────────────────────────────────────
echo "🔨 Build des assets web ($PM run build)..."
$PM run build

# Xcode 26 refuse de nettoyer un dossier Build/ sans cet attribut
if [ -d ios/App/Build ]; then
  xattr -w com.apple.xcode.CreatedByBuildSystem true ios/App/Build 2>/dev/null || true
fi

echo "🔄 Sync Capacitor iOS..."
npx cap sync ios

# ─── Build natif Debug ────────────────────────────────────────
if [ "$USE_DEVICE" = 1 ]; then
  XCB_FLAGS="-workspace $WORKSPACE -scheme $SCHEME -configuration Debug -destination platform=iOS,id=$TARGET"
else
  XCB_FLAGS="-workspace $WORKSPACE -scheme $SCHEME -configuration Debug -destination id=$TARGET"
fi
if [ "$USE_DEVICE" = 1 ]; then
  XCB_FLAGS="$XCB_FLAGS -allowProvisioningUpdates"
  XCB_EXTRA="DEVELOPMENT_TEAM=$TEAM_ID"
else
  XCB_EXTRA=""
fi

echo "🔨 Build natif (xcodebuild Debug)..."
mkdir -p build/ios
RUN_LOG="build/ios/xcodebuild-run.log"
# shellcheck disable=SC2086
if ! xcodebuild $XCB_FLAGS $XCB_EXTRA build > "$RUN_LOG" 2>&1; then
  echo "❌ Échec du build — dernières lignes du log ($RUN_LOG) :" >&2
  tail -30 "$RUN_LOG" >&2
  exit 1
fi

# Localiser le .app réellement produit (fiable quel que soit le réglage
# "build location" de Xcode : DerivedData ou dossier legacy du projet)
# shellcheck disable=SC2086
BUILD_SETTINGS="$(xcodebuild $XCB_FLAGS $XCB_EXTRA -showBuildSettings build 2>/dev/null)"
TARGET_BUILD_DIR="$(echo "$BUILD_SETTINGS" | awk -F' = ' '/ TARGET_BUILD_DIR/{print $2; exit}')"
PRODUCT_NAME="$(echo "$BUILD_SETTINGS" | awk -F' = ' '/ FULL_PRODUCT_NAME/{print $2; exit}')"
APP_PATH="$TARGET_BUILD_DIR/$PRODUCT_NAME"
[ -d "$APP_PATH" ] || { echo "❌ App introuvable : $APP_PATH" >&2; exit 1; }

# ─── Install + lancement ──────────────────────────────────────
if [ "$USE_DEVICE" = 1 ]; then
  echo "📲 Installation sur l'appareil $TARGET..."
  xcrun devicectl device install app --device "$TARGET" "$APP_PATH"
  echo "🚀 Lancement de $APP_ID..."
  xcrun devicectl device process launch --device "$TARGET" "$APP_ID"
else
  echo "📲 Démarrage du simulateur (si besoin)..."
  xcrun simctl bootstatus "$TARGET" -b >/dev/null
  open -a Simulator
  echo "📲 Installation de l'app..."
  xcrun simctl install "$TARGET" "$APP_PATH"
  echo "🚀 Lancement de $APP_ID..."
  xcrun simctl launch "$TARGET" "$APP_ID" >/dev/null
fi

echo ""
echo "✅ Deconnect lancé sur $TARGET"
