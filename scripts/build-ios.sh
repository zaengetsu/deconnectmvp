#!/bin/bash
# ──────────────────────────────────────────────────
# Deconnect — Build iOS
# Usage: ./scripts/build-ios.sh [--archive]
#
# Sans argument : build web + sync Capacitor + ouvre Xcode
# Avec --archive : build web + sync + archive Xcode CLI
# ──────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEAM_ID="${TEAM_ID:-D72UK7R5RE}"
SCHEME="App"
WORKSPACE="$PROJECT_DIR/ios/App/App.xcworkspace"
ARCHIVE_PATH="/tmp/Deconnect.xcarchive"

cd "$PROJECT_DIR"

echo "🔨 Building web assets..."
npm run build

echo "📱 Syncing Capacitor iOS..."
npx cap sync ios

if [ "$1" = "--archive" ]; then
  echo "📦 Archiving for App Store / TestFlight..."
  xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -sdk iphoneos \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    archive \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    | tail -5

  echo ""
  echo "✅ Archive créée : $ARCHIVE_PATH"
  echo ""
  echo "Pour uploader sur TestFlight :"
  echo "  xcodebuild -exportArchive \\"
  echo "    -archivePath $ARCHIVE_PATH \\"
  echo "    -exportPath /tmp/DeconnectExport \\"
  echo "    -exportOptionsPlist ios/ExportOptions.plist \\"
  echo "    -allowProvisioningUpdates"
else
  echo "🚀 Opening Xcode..."
  npx cap open ios
  echo ""
  echo "Dans Xcode :"
  echo "  1. Sélectionner 'Any iOS Device (arm64)' en haut"
  echo "  2. Product → Archive"
  echo "  3. Distribute App → TestFlight & App Store"
fi

echo ""
echo "✅ Build iOS terminé"
