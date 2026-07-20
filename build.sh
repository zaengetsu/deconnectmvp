#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Deconnect — Build
# Usage: ./build.sh [ios|android] [options]
#
#   ./build.sh                  # = ./build.sh ios → produit l'IPA
#   ./build.sh ios              # build web + sync + archive + export IPA
#   ./build.sh ios --open       # build web + sync + ouvre Xcode (pas d'IPA)
#   ./build.sh ios --method debugging
#                               # IPA de dev (installable sur devices provisionnés)
#                               # methods : app-store-connect (défaut),
#                               #           release-testing, debugging
#   ./build.sh ios --upload     # exporte ET uploade directement sur App Store Connect
#   ./build.sh android [...]    # délègue à scripts/build-android.sh
#
# Variables :
#   TEAM_ID   (défaut D72UK7R5RE)
#   SCHEME    (défaut App)
#   ASC_KEY_PATH / ASC_KEY_ID / ASC_ISSUER_ID
#             clé API App Store Connect (.p8) — permet la signature
#             automatique sans compte Apple connecté dans Xcode (CI)
# Sortie    : build/ios/Deconnect-<date>.ipa
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
OUT_DIR="build/ios"
ARCHIVE_PATH="$OUT_DIR/App.xcarchive"

PLATFORM=""
METHOD="app-store-connect"
OPEN_XCODE=0
DESTINATION="export"
FORWARD_ARGS=""

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    ios|android) PLATFORM="$1" ;;
    --method)    METHOD="$2"; shift ;;
    --open)      OPEN_XCODE=1 ;;
    --upload)    DESTINATION="upload" ;;
    -h|--help)   usage; exit 0 ;;
    *)           FORWARD_ARGS="$FORWARD_ARGS $1" ;;
  esac
  shift
done
PLATFORM="${PLATFORM:-ios}"

# ─── Android : déléguer au script existant ────────────────────
if [ "$PLATFORM" = "android" ]; then
  # shellcheck disable=SC2086
  exec "$SCRIPT_DIR/scripts/build-android.sh" $FORWARD_ARGS
fi

# Compat anciens noms de method Xcode
case "$METHOD" in
  app-store)   METHOD="app-store-connect" ;;
  ad-hoc)      METHOD="release-testing" ;;
  development) METHOD="debugging" ;;
esac

# ─── Prérequis : installer si besoin ──────────────────────────
if [ ! -d ios ] || [ ! -d node_modules ]; then
  echo "⚙️  Prérequis manquants (ios/ ou node_modules) — lancement de ./install.sh..."
  "$SCRIPT_DIR/install.sh"
fi

if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then PM="pnpm"; else PM="npm"; fi

# ─── Build web + sync ─────────────────────────────────────────
echo "🔨 Build des assets web ($PM run build)..."
$PM run build

# Xcode 26 refuse de nettoyer un dossier Build/ sans cet attribut
if [ -d ios/App/Build ]; then
  xattr -w com.apple.xcode.CreatedByBuildSystem true ios/App/Build 2>/dev/null || true
fi

echo "🔄 Sync Capacitor iOS..."
npx cap sync ios

if [ "$OPEN_XCODE" = 1 ]; then
  echo "🚀 Ouverture de Xcode..."
  npx cap open ios
  echo ""
  echo "Dans Xcode : 'Any iOS Device (arm64)' → Product → Archive → Distribute App"
  exit 0
fi

mkdir -p "$OUT_DIR"
rm -rf "$ARCHIVE_PATH" "$OUT_DIR/export"

# Clé API App Store Connect (signature sans session Xcode, utile en CI)
AUTH_FLAGS=""
if [ -n "${ASC_KEY_PATH:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  AUTH_FLAGS="-authenticationKeyPath $ASC_KEY_PATH -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID"
  echo "🔑 Authentification via clé API App Store Connect ($ASC_KEY_ID)"
fi

signing_help() {
  echo "" >&2
  echo "💡 xcodebuild n'a pas accès à un compte Apple pour générer le profil" >&2
  echo "   de provisioning de 'ceo.services.rekonect'. Deux solutions :" >&2
  echo "   1. Ouvrir Xcode → Settings → Accounts → se (re)connecter avec" >&2
  echo "      votre Apple ID, puis relancer ./build.sh" >&2
  echo "   2. Utiliser une clé API App Store Connect (sans Xcode ouvert) :" >&2
  echo "      ASC_KEY_PATH=~/keys/AuthKey_XXX.p8 ASC_KEY_ID=XXX \\" >&2
  echo "      ASC_ISSUER_ID=YYY ./build.sh" >&2
  echo "      (clé créée sur appstoreconnect.apple.com → Users → Integrations)" >&2
}

# ─── Archive Release ──────────────────────────────────────────
echo "📦 Archive Xcode (Release, iphoneos)... [~2-5 min]"
ARCHIVE_LOG="$OUT_DIR/xcodebuild-archive.log"
# shellcheck disable=SC2086
if ! xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -sdk iphoneos \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  archive \
  -allowProvisioningUpdates \
  $AUTH_FLAGS \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  > "$ARCHIVE_LOG" 2>&1; then
  echo "❌ Échec de l'archive — dernières lignes du log ($ARCHIVE_LOG) :" >&2
  tail -40 "$ARCHIVE_LOG" >&2
  grep -q "No Accounts" "$ARCHIVE_LOG" && signing_help
  exit 1
fi
echo "✅ Archive : $ARCHIVE_PATH"

# ─── Export IPA ───────────────────────────────────────────────
EXPORT_PLIST="$OUT_DIR/ExportOptions.plist"
cat > "$EXPORT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>$METHOD</string>
  <key>teamID</key>
  <string>$TEAM_ID</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>$DESTINATION</string>
</dict>
PLIST
echo "</plist>" >> "$EXPORT_PLIST"

echo "📤 Export IPA (method: $METHOD, destination: $DESTINATION)..."
EXPORT_LOG="$OUT_DIR/xcodebuild-export.log"
# shellcheck disable=SC2086
if ! xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$OUT_DIR/export" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates \
  $AUTH_FLAGS \
  > "$EXPORT_LOG" 2>&1; then
  echo "❌ Échec de l'export — dernières lignes du log ($EXPORT_LOG) :" >&2
  tail -40 "$EXPORT_LOG" >&2
  grep -q "No Accounts" "$EXPORT_LOG" && signing_help
  exit 1
fi

if [ "$DESTINATION" = "upload" ]; then
  echo ""
  echo "✅ Build uploadé sur App Store Connect (TestFlight)"
  exit 0
fi

RAW_IPA="$(ls "$OUT_DIR"/export/*.ipa 2>/dev/null | head -1)"
[ -n "$RAW_IPA" ] || { echo "❌ Aucun IPA trouvé dans $OUT_DIR/export" >&2; exit 1; }
IPA_PATH="$OUT_DIR/Rekonect-$(date +%Y%m%d-%H%M).ipa"
mv "$RAW_IPA" "$IPA_PATH"

echo ""
echo "✅ Build iOS terminé"
echo "📁 IPA : $IPA_PATH"
echo ""
echo "Pour uploader sur TestFlight :"
echo "  ./build.sh ios --upload        # ré-archive et uploade directement"
echo "  (ou glisser l'IPA dans l'app Transporter)"
