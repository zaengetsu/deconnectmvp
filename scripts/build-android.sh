#!/bin/bash
# ──────────────────────────────────────────────────
# Deconnect — Build Android
# Usage: ./scripts/build-android.sh [--distribute]
#
# Sans argument : build web + sync + APK debug + install émulateur
# Avec --distribute : build + distribue via Firebase App Distribution
# ──────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FIREBASE_APP_ID="1:410630450375:android:f012e7c0ddc7b92a21a2e2"
TESTERS="leonceyopa@gmail.com,stella.berthier@yahoo.fr,i.berthier@wineor.fr"

# Java & Android SDK
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator

cd "$PROJECT_DIR"

echo "🔨 Building web assets..."
npm run build

echo "🤖 Syncing Capacitor Android..."
npx cap sync android

echo "📦 Building APK..."
cd android && ./gradlew assembleDebug | tail -3 && cd ..

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"

if [ "$1" = "--distribute" ]; then
  echo "🚀 Distributing via Firebase App Distribution..."
  firebase appdistribution:distribute \
    "$APK_PATH" \
    --app "$FIREBASE_APP_ID" \
    --testers "$TESTERS" \
    --release-notes "Deconnect beta — $(date '+%d/%m/%Y %H:%M')"
  echo ""
  echo "✅ APK distribué aux testeurs"
else
  # Try to install on emulator/device if connected
  if adb devices 2>/dev/null | grep -q "device$"; then
    echo "📲 Installing on connected device/emulator..."
    adb install -r "$APK_PATH"
    adb shell am start -n app.deconnect.mvp/.MainActivity
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
