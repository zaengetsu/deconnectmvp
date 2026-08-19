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
#  6. Applique la team Apple (TEAM_ID) au projet Xcode
#
# Variables : TEAM_ID (défaut D72UK7R5RE)
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TEAM_ID="${TEAM_ID:-D72UK7R5RE}"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/lib-release.sh"

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
use_project_node   # bascule sur la version de .nvmrc si nvm est installé
command -v node >/dev/null 2>&1 || fail "Node.js introuvable. Installez Node 22.12+ (nvm ou brew install node)."
node_version_ok && ok "Node $(node --version)" \
  || fail "Node ^20.19 ou >=22.12 requis (trouvé : $(node --version)) — en deçà, npm
   n'installe pas le binaire natif de rolldown et le build web échoue.
   Avec nvm :  nvm install $(cat .nvmrc 2>/dev/null || echo 22)"

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

# ─── Team Apple dans le projet Xcode ──────────────────────────
# ios/ est gitignoré : sans ce patch, un projet régénéré par
# `cap add ios` repart sans DEVELOPMENT_TEAM et la signature échoue.
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
if [ -f "$PBXPROJ" ]; then
  if grep -q "DEVELOPMENT_TEAM = $TEAM_ID;" "$PBXPROJ"; then
    ok "Team Apple $TEAM_ID déjà configurée dans Xcode"
  else
    # remplace une team différente, sinon insère après CODE_SIGN_STYLE
    if grep -q "DEVELOPMENT_TEAM = " "$PBXPROJ"; then
      sed -i '' "s/DEVELOPMENT_TEAM = [^;]*;/DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBXPROJ"
    else
      sed -i '' "s/\(CODE_SIGN_STYLE = Automatic;\)/\1\\
				DEVELOPMENT_TEAM = $TEAM_ID;/g" "$PBXPROJ"
    fi
    ok "Team Apple $TEAM_ID appliquée au projet Xcode"
  fi
fi

# ─── Réglages de livraison depuis version.json ────────────────
apply_ios_version
apply_ios_deployment_target
apply_ios_info_plist

# Préférence Xcode "legacy build location" : les produits vont dans
# ios/App/build. Xcode 26 refuse de nettoyer ce dossier s'il ne l'a pas
# créé lui-même, ce qui fait échouer le pod install lancé par cap sync.
# On le recrée nous-mêmes avec l'attribut qui l'autorise à le supprimer.
rm -rf ios/App/Build ios/App/build
mkdir -p ios/App/build
xattr -w com.apple.xcode.CreatedByBuildSystem true ios/App/build 2>/dev/null || true

echo "🔄 Sync Capacitor iOS (copie dist/ + pod install)..."
npx cap sync ios

echo ""
ok "Installation iOS terminée"
echo ""
echo "Prochaines étapes :"
echo "  ./build.sh              # build iOS → IPA (TestFlight/App Store)"
echo "  ./run.sh                # lancer sur simulateur"
echo "  ./run.sh ios --device   # lancer sur iPhone branché"
