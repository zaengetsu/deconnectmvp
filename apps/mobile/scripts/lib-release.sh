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

# Réglages Info.plist. Deux raisons de les tenir ici plutôt que dans
# ios/ (régénérable) :
#  - purpose strings : le binaire lie les APIs Camera/Photos via
#    @capacitor/camera, Apple refuse le build sans NS*UsageDescription
#    (erreur 90683 au traitement), même pour les APIs jamais appelées ;
#  - ITSAppUsesNonExemptEncryption : sans elle, chaque build attend une
#    réponse au questionnaire de conformité export avant distribution.
apply_ios_info_plist() {
  PLIST="ios/App/App/Info.plist"
  [ -f "$PLIST" ] || return 0
  # une clé par ligne : le découpage sur espaces n'est pas portable
  # (zsh ne fait pas de word splitting sur $VAR, contrairement à bash)
  KEYS="$(node -p "Object.keys((require('./version.json').ios||{}).infoPlist||{}).join('\n')" 2>/dev/null)"
  [ -n "$KEYS" ] || return 0
  # plutil et pas PlistBuddy : ce dernier parse les quotes à l'intérieur
  # de sa commande, une apostrophe française ("l'appareil") le fait échouer.
  N=0
  while IFS= read -r K; do
    [ -n "$K" ] || continue
    T="$(node -p "typeof require('./version.json').ios.infoPlist['$K']")"
    V="$(node -p "String(require('./version.json').ios.infoPlist['$K'])")"
    case "$T" in
      boolean) plutil -replace "$K" -bool   "$V" "$PLIST" || return 1 ;;
      number)  plutil -replace "$K" -integer "$V" "$PLIST" || return 1 ;;
      *)       plutil -replace "$K" -string "$V" "$PLIST" || return 1 ;;
    esac
    N=$((N + 1))
  done <<EOF_KEYS
$KEYS
EOF_KEYS
  echo "🔐 $N clés Info.plist appliquées"
}

# À appliquer AVANT cap sync : pod install fige la plateforme des Pods.
apply_ios_deployment_target() {
  T="$(node -p "(require('./version.json').ios||{}).deploymentTarget||''" 2>/dev/null)"
  [ -n "$T" ] || return 0
  PBX="ios/App/App.xcodeproj/project.pbxproj"
  [ -f "$PBX" ] && sed -i '' "s/IPHONEOS_DEPLOYMENT_TARGET = [^;]*;/IPHONEOS_DEPLOYMENT_TARGET = $T;/g" "$PBX"
  POD="ios/App/Podfile"
  [ -f "$POD" ] && sed -i '' "s/^platform :ios, '.*'/platform :ios, '$T'/" "$POD"
  echo "📱 Deployment target iOS $T appliqué (Xcode + Podfile)"
}

apply_android_version() {
  GRADLE="android/app/build.gradle"
  V="$(read_version)"; B="$(read_build)"
  [ -f "$GRADLE" ] && [ -n "$V" ] && [ -n "$B" ] || return 0
  sed -i '' "s/versionName \".*\"/versionName \"$V\"/" "$GRADLE"
  sed -i '' "s/versionCode [0-9][0-9]*/versionCode $B/" "$GRADLE"
  echo "🏷️  Version $V (versionCode $B) appliquée au projet Gradle"
}
