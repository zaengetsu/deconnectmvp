#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Rekonect — distribution aux testeurs via Firebase App Distribution
#
# Usage : ./scripts/firebase.sh [android|ios|all] [options]
#   android (défaut)   APK envoyé aux testeurs Android
#   ios                IPA « release-testing » (appareils enregistrés dans le profil)
#   all                les deux
# Options :
#   --notes "…"        notes de version (défaut : derniers commits)
#   --testers "a@b,…"  testeurs (sinon FIREBASE_TESTERS)
#   --groups "beta"    groupes Firebase (sinon FIREBASE_GROUPS)
#   --no-bump · --build <n> · --commit · --allow-dirty · --allow-local-api · --dry-run
#
# Réglages (~/.rekonect/release.env ou <racine>/.release.env) :
#   FIREBASE_ANDROID_APP_ID   (défaut : 1:835280216367:android:d0ffc52d400b6aa8da01da)
#   FIREBASE_IOS_APP_ID       requis pour ios
#   FIREBASE_TESTERS, FIREBASE_GROUPS
#   GOOGLE_APPLICATION_CREDENTIALS  compte de service (sinon `firebase login`)
# ──────────────────────────────────────────────────────────────
set -euo pipefail
. "$(dirname "$0")/lib.sh"

PLATFORM="android"; BUMP=1; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    android|ios|all) PLATFORM="$1" ;;
    --notes) NOTES="$2"; shift ;;
    --testers) FIREBASE_TESTERS="$2"; shift ;;
    --groups) FIREBASE_GROUPS="$2"; shift ;;
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

echo "🔥 Rekonect → Firebase App Distribution ($PLATFORM)"

step "Vérifications"
load_release_env
use_node
FIREBASE_ANDROID_APP_ID="${FIREBASE_ANDROID_APP_ID:-1:835280216367:android:d0ffc52d400b6aa8da01da}"
FIREBASE_TESTERS="${FIREBASE_TESTERS:-leonceyopa@gmail.com,stella.berthier@yahoo.fr,i.berthier@wineor.fr}"
FIREBASE_GROUPS="${FIREBASE_GROUPS:-}"
if ! command -v firebase >/dev/null 2>&1; then
  info "firebase-tools absent : installation (npm i -g firebase-tools)"
  npm i -g firebase-tools >/dev/null 2>&1 || fail "Installez firebase-tools : npm i -g firebase-tools"
fi
if [ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && ! firebase projects:list >/dev/null 2>&1; then
  fail "Firebase n'est pas connecté. Lancez « firebase login », ou définissez GOOGLE_APPLICATION_CREDENTIALS (compte de service)."
fi
ok "Firebase connecté"
case "$PLATFORM" in
  ios|all)
    [ "$(uname)" = "Darwin" ] || fail "La distribution iOS se construit depuis un Mac."
    [ -n "${FIREBASE_IOS_APP_ID:-}" ] || fail "FIREBASE_IOS_APP_ID manquant (console Firebase → Paramètres du projet → app iOS)." ;;
esac
check_git_state
check_mobile_env
ok "Testeurs : ${FIREBASE_TESTERS:-aucun}${FIREBASE_GROUPS:+ · groupes : $FIREBASE_GROUPS}"

if [ "$DRY" = 1 ]; then
  ok "Configuration prête (--dry-run : rien n'a été construit). Build actuel : $(current_version)"
  exit 0
fi

step "Numéro de build"
if [ "$BUMP" = 1 ]; then bump_build; else ok "Build conservé : $(current_version)"; fi
NOTES_TEXT="$(release_notes)"
(cd "$ROOT_DIR" && pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install)

distribute() {
  local file="$1" app="$2"
  local args=(appdistribution:distribute "$file" --app "$app" --release-notes "$NOTES_TEXT")
  [ -n "$FIREBASE_TESTERS" ] && args+=(--testers "$FIREBASE_TESTERS")
  [ -n "$FIREBASE_GROUPS" ] && args+=(--groups "$FIREBASE_GROUPS")
  firebase "${args[@]}"
}

if [ "$PLATFORM" = android ] || [ "$PLATFORM" = all ]; then
  step "Android : build de l'APK"
  (cd "$MOBILE_DIR" && FIREBASE_SKIP_DISTRIBUTE=1 ./scripts/build-android.sh --distribute)
  APK="$MOBILE_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
  [ -f "$APK" ] || fail "APK introuvable : $APK"
  step "Android : envoi aux testeurs"
  distribute "$APK" "$FIREBASE_ANDROID_APP_ID"
  ok "APK $(current_version) distribué"
fi

if [ "$PLATFORM" = ios ] || [ "$PLATFORM" = all ]; then
  step "iOS : build de l'IPA (release-testing)"
  "$MOBILE_DIR/build.sh" ios --method release-testing
  IPA="$(ls -t "$MOBILE_DIR"/build/ios/Rekonect-*.ipa 2>/dev/null | head -1)"
  [ -n "$IPA" ] || fail "IPA introuvable dans apps/mobile/build/ios"
  step "iOS : envoi aux testeurs"
  distribute "$IPA" "$FIREBASE_IOS_APP_ID"
  ok "IPA $(current_version) distribué"
  info "Un iPhone doit être enregistré dans le profil de provisioning pour installer ce build."
fi

step "Terminé"
commit_version
