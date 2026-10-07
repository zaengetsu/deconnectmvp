#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Rekonect — remettre le projet et l'API à jour
#
# Usage : ./scripts/resync.sh [options]
#   (sans option)   code → dépendances → paquets partagés → Prisma → migrations → build API
#   --no-code       ne pas récupérer de nouveau code
#   --stash         mettre de côté les modifications locales le temps de la mise à jour
#   --seed          recharger le catalogue de référence (activités, récompenses, plans)
#   --check         vérifier ensuite : types de tout le monorepo + tests unitaires API
#   --mobile        reconstruire l'app mobile et synchroniser iOS/Android (cap sync)
#   --no-backup     pas de sauvegarde de la base avant migration
#   --yes           ne pas demander de confirmation (base distante)
#
# D'où vient le code : le paquet .transfer/rekonect-monorepo.bundle s'il contient du
# nouveau, sinon le dépôt distant « origin » s'il existe.
# Base : DATABASE_URL de apps/api/.env. Une base Supabase existante (tables présentes,
# jamais migrée par Prisma) est d'abord marquée « baseline », puis les migrations
# suivantes sont appliquées.
# ──────────────────────────────────────────────────────────────
set -euo pipefail
. "$(dirname "$0")/lib.sh"

CODE=1; STASH=0; SEED=0; CHECK=0; MOBILE=0; BACKUP=1; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-code) CODE=0 ;;
    --stash) STASH=1 ;;
    --seed) SEED=1 ;;
    --check) CHECK=1 ;;
    --mobile) MOBILE=1 ;;
    --no-backup) BACKUP=0 ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "Option inconnue : $1 (voir --help)" ;;
  esac
  shift
done

confirm() {
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || fail "$1 — relancez avec --yes pour confirmer sans interaction."
  printf '  ❓ %s [o/N] ' "$1"
  read -r answer
  case "$answer" in o|O|oui|y|Y|yes) return 0 ;; *) fail "Annulé." ;; esac
}

cd "$ROOT_DIR"
echo "🔄 Rekonect → mise à jour du projet et de l'API"

# ─── 1. Code ──────────────────────────────────────────────────
if [ "$CODE" = 1 ]; then
  step "Code"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  BUNDLE="$ROOT_DIR/.transfer/rekonect-monorepo.bundle"
  SOURCE=""
  if [ -f "$BUNDLE" ] && git bundle verify -q "$BUNDLE" >/dev/null 2>&1; then
    git fetch -q "$BUNDLE" "$BRANCH" 2>/dev/null || git fetch -q "$BUNDLE" feat/monorepo-nestjs
    if ! git merge-base --is-ancestor FETCH_HEAD HEAD; then SOURCE="paquet .transfer"; fi
  fi
  if [ -z "$SOURCE" ] && git remote get-url origin >/dev/null 2>&1; then
    case "$(git remote get-url origin)" in
      *.bundle) ;;
      *) git fetch -q origin "$BRANCH" 2>/dev/null && ! git merge-base --is-ancestor FETCH_HEAD HEAD && SOURCE="origin/$BRANCH" ;;
    esac
  fi
  if [ -z "$SOURCE" ]; then
    ok "Déjà à jour ($BRANCH @ $(git rev-parse --short HEAD))"
  else
    STASHED=0
    if ! git diff --quiet HEAD || [ -n "$(git ls-files --others --exclude-standard | head -1)" ]; then
      if [ "$STASH" = 1 ]; then
        git stash push -u -q -m "resync $(date '+%F %T')" && STASHED=1
        info "Modifications locales mises de côté (git stash)."
      elif ! git diff --quiet HEAD; then
        fail "Des modifications ne sont pas commitées ($(git status --short | wc -l | tr -d ' ') fichiers) et la mise à jour pourrait les toucher.
   Commitez-les, ou relancez avec --stash (elles seront remises en place après la mise à jour)."
      fi
    fi
    if git merge --ff-only -q FETCH_HEAD 2>/dev/null; then
      ok "Mis à jour depuis $SOURCE : $(git log --oneline -1)"
    elif git merge --no-edit -q FETCH_HEAD; then
      ok "Fusionné avec $SOURCE (vos commits locaux sont conservés)"
    else
      fail "Conflits pendant la fusion avec $SOURCE : résolvez-les (git status), puis relancez avec --no-code.
   Pour annuler : git merge --abort${STASHED:+ puis git stash pop}"
    fi
    if [ "$STASHED" = 1 ]; then
      git stash pop -q || fail "Vos modifications n'ont pas pu être remises en place sans conflit.
   Résolvez les fichiers en conflit (git status) ; la copie reste dans « git stash list »."
      ok "Modifications locales remises en place"
    fi
  fi
fi

# ─── 2. Dépendances et paquets partagés ───────────────────────
step "Dépendances"
use_node
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install
ok "pnpm install"
pnpm turbo run build --filter="./packages/*" --output-logs=errors-only >/dev/null
ok "Paquets partagés construits (contracts, api-client, ui…)"

# ─── 3. Configuration de l'API ────────────────────────────────
step "Configuration de l'API"
if [ ! -f "$API_DIR/.env" ]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  fail "apps/api/.env vient d'être créé depuis .env.example : renseignez au moins DATABASE_URL et JWT_ACCESS_SECRET, puis relancez."
fi
DB_URL="$(env_value DATABASE_URL "$API_DIR/.env")"
[ -n "$DB_URL" ] || fail "DATABASE_URL vide dans apps/api/.env."
[ "$(env_value JWT_ACCESS_SECRET "$API_DIR/.env" | wc -c)" -gt 32 ] || fail "JWT_ACCESS_SECRET doit contenir au moins 32 caractères (apps/api/.env)."
DB_HOST="$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://([^@]*@)?([^:/?]+).*#\2#')"
REMOTE=1
case "$DB_HOST" in localhost|127.0.0.1|postgres|host.docker.internal) REMOTE=0 ;; esac
ok "Base : $DB_HOST$([ "$REMOTE" = 1 ] && echo ' (distante)')"
missing_hint() {
  case "$1" in
    SUPABASE_JWT_SECRET) echo "les anciennes versions de l'app (connectées via Supabase) ne pourront plus appeler l'API" ;;
    BREVO_API_KEY) echo "les emails restent en file sans être envoyés" ;;
    STRIPE_SECRET_KEY) echo "les paiements sont désactivés" ;;
  esac
}
for k in SUPABASE_JWT_SECRET BREVO_API_KEY STRIPE_SECRET_KEY; do
  [ -n "$(env_value "$k" "$API_DIR/.env")" ] || warn "$k vide : $(missing_hint "$k")"
done

# ─── 4. Prisma et migrations ──────────────────────────────────
step "Base de données"
cd "$API_DIR"
pnpm exec prisma generate >/dev/null
ok "Client Prisma généré"

STATUS="$(pnpm exec prisma migrate status 2>&1 || true)"
if printf '%s' "$STATUS" | grep -qE "P1001|P1000|Can't reach database|Authentication failed"; then
  fail "Base injoignable ($DB_HOST). Vérifiez DATABASE_URL et que la base est démarrée (pnpm db:up en local).
$(printf '%s' "$STATUS" | grep -E 'Error|error' | head -3)"
fi
# Base Supabase jamais migrée par Prisma : pas de table _prisma_migrations, mais des tables métier.
# « migrate status » la présente alors comme « 7 migrations en attente », baseline comprise : c'est
# « migrate deploy » qui échouerait ensuite en P3005. On la repère aux deux signes.
NEEDS_BASELINE=0
if printf '%s' "$STATUS" | grep -qE "P3005|not managed by Prisma|schema is not empty"; then NEEDS_BASELINE=1; fi
if printf '%s' "$STATUS" | grep -q "20260924000000_baseline" && printf '%s' "$STATUS" | grep -q "have not yet been applied" \
   && ! printf '%s' "$STATUS" | grep -q "No migration found in prisma/migrations"; then
  if printf 'SELECT 1 FROM children LIMIT 1;' | pnpm exec prisma db execute --stdin >/dev/null 2>&1; then NEEDS_BASELINE=1; fi
fi
if [ "$NEEDS_BASELINE" = 1 ]; then
  info "Base existante jamais migrée par Prisma (ancienne base Supabase) : marquage « baseline »."
  confirm "Marquer $DB_HOST comme déjà au niveau de la migration baseline ?"
  pnpm exec prisma migrate resolve --applied 20260924000000_baseline >/dev/null
  ok "Baseline marquée"
  STATUS="$(pnpm exec prisma migrate status 2>&1 || true)"
fi
PENDING="$(printf '%s\n' "$STATUS" | awk '/have not yet been applied/{f=1;next} f&&NF{print} f&&!NF{exit}' | sed 's/^ *//')"
if printf '%s' "$STATUS" | grep -q "Database schema is up to date"; then
  ok "Aucune migration en attente"
elif [ -n "$PENDING" ]; then
  info "Migrations à appliquer :"; printf '%s\n' "$PENDING" | sed 's/^/     • /'
  if [ "$REMOTE" = 1 ]; then
    if [ "$BACKUP" = 1 ] && command -v pg_dump >/dev/null 2>&1; then
      mkdir -p "$ROOT_DIR/backups"
      DUMP="$ROOT_DIR/backups/db-$(date +%Y%m%d-%H%M%S).dump"
      if pg_dump -Fc --no-owner --no-privileges -f "$DUMP" "${DB_URL%%\?*}" 2>/dev/null; then ok "Sauvegarde : ${DUMP#$ROOT_DIR/}"; else warn "Sauvegarde impossible (version de pg_dump ?) : on continue."; rm -f "$DUMP"; fi
    elif [ "$BACKUP" = 1 ]; then
      warn "pg_dump absent : pas de sauvegarde avant migration (brew install libpq)."
    fi
    confirm "Appliquer ces migrations sur la base distante $DB_HOST ?"
  fi
  pnpm exec prisma migrate deploy
  ok "Migrations appliquées"
else
  printf '%s\n' "$STATUS" | tail -8
  fail "État des migrations inattendu : voir ci-dessus (pnpm --filter @rekonect/api exec prisma migrate status)."
fi

if [ "$SEED" = 1 ]; then
  pnpm run prisma:seed >/dev/null && ok "Catalogue de référence rechargé"
fi

# ─── 5. Build de l'API ────────────────────────────────────────
step "API"
pnpm run build >/dev/null
ok "API construite (apps/api/dist)"
cd "$ROOT_DIR"

if [ "$CHECK" = 1 ]; then
  step "Vérifications"
  pnpm turbo run typecheck --output-logs=errors-only >/dev/null && ok "Types : OK dans tout le monorepo"
  pnpm --filter @rekonect/api run test:unit >/dev/null && ok "Tests unitaires API : OK"
fi

if [ "$MOBILE" = 1 ]; then
  step "App mobile"
  (cd "$MOBILE_DIR" && pnpm run build >/dev/null && npx cap sync >/dev/null)
  ok "Web reconstruit et projets iOS/Android synchronisés"
fi

# ─── 6. Redémarrage ───────────────────────────────────────────
step "Terminé"
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  info "Une API tourne sur le port 3000 : redémarrez-la pour charger la nouvelle version."
fi
cat <<MSG
  Pour lancer :
    pnpm dev:api                                  API en développement (http://localhost:3000)
    pnpm --filter @rekonect/api start             API compilée
    pnpm --filter @rekonect/api start:worker      worker (notifications, emails, relances)
MSG
