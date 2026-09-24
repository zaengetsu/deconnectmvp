#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Rekonect — livraison iOS sur TestFlight
#
# Usage : ./scripts/testflight.sh [options]
#   --no-bump          garder le numéro de build actuel (sinon +1)
#   --build <n>        numéro de build minimal (si App Store Connect a déjà mieux)
#   --commit           commiter apps/mobile/version.json après l'envoi
#   --allow-dirty      livrer même avec des modifications non commitées
#   --allow-local-api  accepter une API locale (test sur votre réseau)
#   --dry-run          vérifier la configuration sans rien construire
#
# Réglages (dans ~/.rekonect/release.env ou <racine>/.release.env) :
#   ASC_KEY_ID, ASC_ISSUER_ID   clé API App Store Connect (Users → Integrations)
#   ASC_KEY_PATH                chemin du .p8 (sinon cherché dans ~/.private_keys,
#                               ~/.appstoreconnect/private_keys, ~/private_keys)
#   TEAM_ID, PROFILE            (défauts : D72UK7R5RE, Rekonect_AppStore)
#
# Étapes : vérifications → numéro de build → build web → cap sync →
#          archive Xcode → export IPA → validation → upload (apps/mobile/build.sh).
# ──────────────────────────────────────────────────────────────
set -euo pipefail
. "$(dirname "$0")/lib.sh"

BUMP=1; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-bump) BUMP=0 ;;
    --build) MIN_BUILD="$2"; shift ;;
    --commit) COMMIT_VERSION=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --allow-local-api) ALLOW_LOCAL_API=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Option inconnue : $1 (voir --help)" ;;
  esac
  shift
done

echo "🍎 Rekonect → TestFlight"

step "Vérifications"
[ "$(uname)" = "Darwin" ] || fail "La livraison iOS se fait depuis un Mac (Xcode)."
command -v xcodebuild >/dev/null 2>&1 || fail "Xcode introuvable."
load_release_env
use_node
[ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] || fail "Clé App Store Connect manquante.
   Créez-la sur appstoreconnect.apple.com → Users and Access → Integrations, puis dans ~/.rekonect/release.env :
     ASC_KEY_ID=XXXXXXXXXX
     ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   et placez AuthKey_XXXXXXXXXX.p8 dans ~/.private_keys/"
if [ -z "${ASC_KEY_PATH:-}" ]; then
  for d in "$HOME/.private_keys" "$HOME/.appstoreconnect/private_keys" "$HOME/private_keys"; do
    [ -f "$d/AuthKey_$ASC_KEY_ID.p8" ] && ASC_KEY_PATH="$d/AuthKey_$ASC_KEY_ID.p8" && break
  done
fi
[ -f "${ASC_KEY_PATH:-/nonexistent}" ] || fail "Fichier AuthKey_$ASC_KEY_ID.p8 introuvable (ASC_KEY_PATH ou ~/.private_keys/)."
export ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
ok "Clé App Store Connect $ASC_KEY_ID"
check_git_state
check_mobile_env
if [ ! -d "$MOBILE_DIR/ios" ] && [ -d "$ROOT_DIR/ios" ]; then
  info "Le projet Xcode sera régénéré dans apps/mobile/ios (l'ancien dossier ios/ à la racine n'est plus utilisé)."
fi

if [ "$DRY" = 1 ]; then
  ok "Configuration prête (--dry-run : rien n'a été construit). Build actuel : $(current_version)"
  exit 0
fi

step "Numéro de build"
if [ "$BUMP" = 1 ]; then bump_build; else ok "Build conservé : $(current_version)"; fi

step "Build, archive et envoi"
(cd "$ROOT_DIR" && pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install)
"$MOBILE_DIR/build.sh" ios --upload

step "Terminé"
ok "Rekonect $(current_version) envoyé sur App Store Connect."
info "Le build apparaît dans TestFlight après le traitement Apple (5 à 30 min)."
commit_version
