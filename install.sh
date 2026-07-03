#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Deconnect — Installation des prérequis iOS
# Usage: ./install.sh
#
# Idempotent : peut être relancé sans risque.
#  1. Vérifie macOS + Xcode (+ licence)
#  2. Vérifie Node >= 20 et choisit pnpm ou npm
#  3. Installe les dépendances JS
#  4. Vérifie/répare CocoaPods (via Homebrew si le gem système est cassé)
#  5. Build web + génère le projet natif ios/ (cap add) + pod install (cap sync)
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Homebrew (Apple Silicon ou Intel) en tête de PATH pour que le pod
# de brew prenne le pas sur un éventuel gem système cassé
if command -v brew >/dev/null 2>&1; then
  export PATH="$(brew --prefix)/bin:$PATH"
fi

ok()   { echo "✅ $1"; }
info() { echo "ℹ️  $1"; }
fail() { echo "❌ $1" >&2; exit 1; }

# ─── 1. macOS + Xcode ─────────────────────────────────────────
[ "$(uname)" = "Darwin" ] && ok "macOS détecté" \
  || fail "Ce script doit tourner sur macOS (build iOS impossible ailleurs)."

if ! xcode-select -p >/dev/null 2>&1; then
  fail "Xcode n'est pas installé. Installez-le depuis l'App Store puis relancez ./install.sh"
fi

if xcode-select -p | grep -q "CommandLineTools"; then
  fail "xcode-select pointe vers les Command Line Tools seuls.
   Exécutez :  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   puis relancez ./install.sh"
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  fail "xcodebuild ne répond pas (licence non acceptée ?).
   Exécutez :  sudo xcodebuild -license accept
   puis relancez ./install.sh"
fi
ok "Xcode $(xcodebuild -version | head -1 | awk '{print $2}') opérationnel"

# ─── 2. Node + gestionnaire de paquets ────────────────────────
command -v node >/dev/null 2>&1 || fail "Node.js introuvable. Installez Node 20+ (nvm ou brew install node)."
NODE_MAJOR="$(node --version | sed 's/v\([0-9]*\).*/\1/')"
[ "$NODE_MAJOR" -ge 20 ] && ok "Node $(node --version)" \
  || fail "Node 20+ requis (trouvé : $(node --version)). Mettez à jour Node puis relancez."

if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
else
  PM="npm"
fi
ok "Gestionnaire de paquets : $PM"

# ─── 3. Dépendances JS ────────────────────────────────────────
echo "📦 Installation des dépendances JS ($PM install)..."
$PM install

# ─── 4. CocoaPods ─────────────────────────────────────────────
if pod --version >/dev/null 2>&1; then
  ok "CocoaPods $(pod --version)"
else
  info "CocoaPods absent ou cassé (gem Ruby système incompatible) — installation via Homebrew..."
  command -v brew >/dev/null 2>&1 \
    || fail "Homebrew requis pour installer CocoaPods : https://brew.sh puis relancez ./install.sh"
  brew install cocoapods
  hash -r
  pod --version >/dev/null 2>&1 && ok "CocoaPods $(pod --version) installé via Homebrew" \
    || fail "CocoaPods toujours indisponible après installation. Vérifiez 'brew doctor'."
fi

# ─── 5. Build web + projet natif iOS ──────────────────────────
echo "🔨 Build des assets web..."
$PM run build

if [ ! -d ios ]; then
  echo "📱 Génération du projet natif iOS (npx cap add ios)..."
  npx cap add ios
else
  info "Projet ios/ déjà présent"
fi

# Xcode 26 refuse de nettoyer un dossier Build/ sans cet attribut,
# ce qui fait échouer le pod install lancé par cap sync
if [ -d ios/App/Build ]; then
  xattr -w com.apple.xcode.CreatedByBuildSystem true ios/App/Build 2>/dev/null || true
fi

echo "🔄 Sync Capacitor iOS (copie dist/ + pod install)..."
npx cap sync ios

echo ""
ok "Installation iOS terminée"
echo ""
echo "Prochaines étapes :"
echo "  ./build.sh              # build iOS → IPA (TestFlight/App Store)"
echo "  ./run.sh                # lancer sur simulateur"
echo "  ./run.sh ios --device   # lancer sur iPhone branché"
