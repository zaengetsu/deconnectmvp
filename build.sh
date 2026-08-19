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
#   PROFILE   nom du profil de provisioning App Store installé
#             (défaut Rekonect_AppStore) — utilisé pour l'export en
#             signature manuelle quand aucun compte Apple n'est
#             connecté dans Xcode (la signature cloud échoue alors)
#   ASC_KEY_PATH / ASC_KEY_ID / ASC_ISSUER_ID
#             clé API App Store Connect (.p8) — signature et upload
#             sans compte Apple connecté dans Xcode (CI)
# Sortie    : build/ios/Rekonect-<date>.ipa
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v brew >/dev/null 2>&1; then
  export PATH="$(brew --prefix)/bin:$PATH"
fi

# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/lib-release.sh"
use_project_node   # Node de .nvmrc (rolldown exige ^20.19 || >=22.12)

TEAM_ID="${TEAM_ID:-D72UK7R5RE}"
SCHEME="${SCHEME:-App}"
PROFILE="${PROFILE:-Rekonect_AppStore}"
BUNDLE_ID="${BUNDLE_ID:-ceo.services.rekonect}"
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

if ! node_version_ok; then
  echo "❌ Node ^20.19 ou >=22.12 requis pour le build web (trouvé : $(node --version))." >&2
  echo "   nvm install $(cat .nvmrc 2>/dev/null || echo 22)" >&2
  exit 1
fi

if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then PM="pnpm"; else PM="npm"; fi

# ─── Build web + sync ─────────────────────────────────────────
echo "🔨 Build des assets web ($PM run build)..."
$PM run build

# Préférence Xcode "legacy build location" : les produits vont dans
# ios/App/build. Xcode 26 refuse de nettoyer ce dossier s'il ne l'a pas
# créé lui-même, ce qui fait échouer le clean lancé par cap sync. On le
# recrée nous-mêmes avec l'attribut qui l'autorise à le supprimer.
rm -rf ios/App/Build ios/App/build
mkdir -p ios/App/build
xattr -w com.apple.xcode.CreatedByBuildSystem true ios/App/build 2>/dev/null || true

echo "🔄 Sync Capacitor iOS..."
npx cap sync ios

# Version + build number : version.json fait foi (ios/ est gitignoré)
apply_ios_version

if [ "$OPEN_XCODE" = 1 ]; then
  echo "🚀 Ouverture de Xcode..."
  npx cap open ios
  echo ""
  echo "Dans Xcode : 'Any iOS Device (arm64)' → Product → Archive → Distribute App"
  exit 0
fi

mkdir -p "$OUT_DIR"
rm -rf "$ARCHIVE_PATH" "$OUT_DIR/export"

# Clé API App Store Connect (signature + upload sans session Xcode)
# Le .p8 peut être trouvé automatiquement dans les emplacements standards
# à partir du seul ASC_KEY_ID.
AUTH_FLAGS=""
if [ -z "${ASC_KEY_PATH:-}" ] && [ -n "${ASC_KEY_ID:-}" ]; then
  for d in "$HOME/.private_keys" "$HOME/.appstoreconnect/private_keys" "$HOME/private_keys"; do
    if [ -f "$d/AuthKey_$ASC_KEY_ID.p8" ]; then ASC_KEY_PATH="$d/AuthKey_$ASC_KEY_ID.p8"; break; fi
  done
fi
if [ -n "${ASC_KEY_PATH:-}" ] && [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ]; then
  AUTH_FLAGS="-authenticationKeyPath $ASC_KEY_PATH -authenticationKeyID $ASC_KEY_ID -authenticationKeyIssuerID $ASC_ISSUER_ID"
  echo "🔑 Authentification via clé API App Store Connect ($ASC_KEY_ID)"
elif [ "$DESTINATION" = "upload" ]; then
  echo "❌ --upload nécessite une clé API App Store Connect." >&2
  echo "   ASC_KEY_ID=<id> ASC_ISSUER_ID=<uuid> ./build.sh ios --upload" >&2
  echo "   (le .p8 est cherché dans ~/.private_keys, ~/.appstoreconnect/private_keys)" >&2
  exit 1
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
# Sans compte Apple connecté dans Xcode, la signature automatique à
# l'export échoue ("Cloud signing permission error"). Si le profil
# App Store est installé localement, on signe manuellement avec lui :
# l'export re-signe l'app entière en Apple Distribution.
PROFILE_DIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
HAS_PROFILE=0
if [ "$METHOD" = "app-store-connect" ]; then
  for p in "$PROFILE_DIR"/*.mobileprovision; do
    [ -f "$p" ] || continue
    if security cms -D -i "$p" 2>/dev/null | grep -q "<string>$PROFILE</string>"; then
      HAS_PROFILE=1; break
    fi
  done
fi

EXPORT_PLIST="$OUT_DIR/ExportOptions.plist"
{
  echo '<?xml version="1.0" encoding="UTF-8"?>'
  echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
  echo '<plist version="1.0">'
  echo '<dict>'
  echo "  <key>method</key><string>$METHOD</string>"
  echo "  <key>teamID</key><string>$TEAM_ID</string>"
  echo '  <key>destination</key><string>export</string>'
  if [ "$HAS_PROFILE" = 1 ]; then
    echo '  <key>signingStyle</key><string>manual</string>'
    echo '  <key>signingCertificate</key><string>Apple Distribution</string>'
    echo '  <key>provisioningProfiles</key><dict>'
    echo "    <key>$BUNDLE_ID</key><string>$PROFILE</string>"
    echo '  </dict>'
  else
    echo '  <key>signingStyle</key><string>automatic</string>'
  fi
  echo '</dict>'
  echo '</plist>'
} > "$EXPORT_PLIST"

if [ "$HAS_PROFILE" = 1 ]; then
  echo "📤 Export IPA (method: $METHOD, signature manuelle via '$PROFILE')..."
else
  echo "📤 Export IPA (method: $METHOD, signature automatique)..."
fi
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

RAW_IPA="$(ls "$OUT_DIR"/export/*.ipa 2>/dev/null | head -1)"
[ -n "$RAW_IPA" ] || { echo "❌ Aucun IPA trouvé dans $OUT_DIR/export" >&2; exit 1; }
IPA_PATH="$OUT_DIR/Rekonect-$(date +%Y%m%d-%H%M).ipa"
mv "$RAW_IPA" "$IPA_PATH"

echo ""
echo "✅ Build iOS terminé"
echo "📁 IPA : $IPA_PATH"

# ─── Upload App Store Connect ─────────────────────────────────
# altool + clé API : ne dépend pas du cloud signing, contrairement
# à l'export avec destination=upload.
if [ "$DESTINATION" = "upload" ]; then
  echo ""
  echo "🚀 Validation puis upload sur App Store Connect..."
  if ! xcrun altool --validate-app -f "$IPA_PATH" -t ios \
        --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"; then
    echo "❌ Validation refusée par App Store Connect — upload annulé." >&2
    exit 1
  fi
  if ! xcrun altool --upload-app -f "$IPA_PATH" -t ios \
        --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"; then
    echo "❌ Échec de l'upload." >&2
    exit 1
  fi
  echo ""
  echo "✅ Build uploadé sur App Store Connect (traitement TestFlight en cours)"
  exit 0
fi

echo ""
echo "Pour uploader sur TestFlight :"
echo "  ASC_KEY_ID=<id> ASC_ISSUER_ID=<uuid> ./build.sh ios --upload"
echo "  (ou glisser l'IPA dans l'app Transporter)"
