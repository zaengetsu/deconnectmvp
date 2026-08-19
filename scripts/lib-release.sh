#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Deconnect — fonctions partagées par install.sh / build.sh
# (fichier sourcé, pas exécuté)
# ──────────────────────────────────────────────────────────────

# ─── Node ─────────────────────────────────────────────────────
# vite 8 / rolldown exigent Node ^20.19 || >=22.12. Sur une version
# antérieure, npm saute silencieusement le binaire natif optionnel
# (@rolldown/binding-darwin-arm64) et le build web échoue à l'import.
# Si nvm est présent, on bascule sur la version de .nvmrc.
use_project_node() {
  if [ -s "$HOME/.nvm/nvm.sh" ] && [ -f .nvmrc ]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
    nvm use >/dev/null 2>&1 || nvm install >/dev/null 2>&1 || true
  fi
}

node_version_ok() {
  node -e 'const [a,b] = process.versions.node.split(".").map(Number);
           process.exit((a > 22 || (a === 22 && b >= 12) || (a === 20 && b >= 19)) ? 0 : 1)' 2>/dev/null
}

# ─── Version applicative ──────────────────────────────────────
# version.json est la source de vérité : ios/ et android/ sont
# gitignorés (donc régénérables), le numéro de build doit vivre
# dans le dépôt. App Store Connect et Google Play refusent deux
# livraisons au même numéro de build.
read_version() { node -p "require('./version.json').version" 2>/dev/null; }
read_build()   { node -p "require('./version.json').build"   2>/dev/null; }

apply_ios_version() {
  PBX="ios/App/App.xcodeproj/project.pbxproj"
  V="$(read_version)"; B="$(read_build)"
  [ -f "$PBX" ] && [ -n "$V" ] && [ -n "$B" ] || return 0
  sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $V;/g" "$PBX"
  sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $B;/g" "$PBX"
  echo "🏷️  Version $V (build $B) appliquée au projet Xcode"
}
