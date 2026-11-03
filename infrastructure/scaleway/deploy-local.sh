#!/bin/bash
# ══════════════════════════════════════════════════════════════
# deploy-local.sh — build, push et déploiement de Rekonect sur Scaleway depuis ce poste
#
#   ./infrastructure/scaleway/deploy-local.sh production            # tout : api, worker, admin, partners
#   ./infrastructure/scaleway/deploy-local.sh production api        # api + worker (même image)
#   ./infrastructure/scaleway/deploy-local.sh production admin partners
#   ./infrastructure/scaleway/deploy-local.sh staging
#   (alias : pnpm deploy:prod [apps…])
#
# Options : --allow-dirty   déployer des modifications non commitées (le tag d'image le signale)
#           --skip-migrate  ne pas jouer les migrations (SKIP_MIGRATE=1)
#           --no-backup     pas de pg_dump avant les migrations
#           --skip-prune    garder toutes les images du registre (SKIP_PRUNE=1)
#           --no-smoke      ne pas lancer smoke.sh à la fin
#
# Ordre : contrôles → sauvegarde + migrations → images → conteneurs → purge → test de fumée.
# ══════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/lib.sh"

select_env "${1:-}"; shift || true
TARGETS=()
ALLOW_DIRTY=0; BACKUP=1; SMOKE=1
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"; SKIP_PRUNE="${SKIP_PRUNE:-0}"
for arg in "$@"; do
  case "$arg" in
    all) TARGETS=("${APPS[@]}") ;;
    api|worker) TARGETS+=(api worker) ;;   # une seule image : les deux partent ensemble
    admin|partners) TARGETS+=("$arg") ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    --no-backup) BACKUP=0 ;;
    --skip-prune) SKIP_PRUNE=1 ;;
    --no-smoke) SMOKE=0 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) die "Argument inconnu : $arg" ;;
  esac
done
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=("${APPS[@]}")
# Dédoublonnage, dans l'ordre de APPS (l'API avant le worker, les fronts ensuite).
ORDERED=()
for app in "${APPS[@]}"; do
  for t in "${TARGETS[@]}"; do [ "$t" = "$app" ] && { ORDERED+=("$app"); break; }; done
done
TARGETS=("${ORDERED[@]}")
wants() { local a; for a in "${TARGETS[@]}"; do [ "$a" = "$1" ] && return 0; done; return 1; }

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
printf "${BLUE}║  Déploiement Rekonect → %-21s║${NC}\n" "$ENV"
printf "${BLUE}║  %-44s║${NC}\n" "${TARGETS[*]}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"

# ── 1. Contrôles ──────────────────────────────────────────────
step "Contrôles"
require_tools docker scw jq pnpm node git
require_env_file
docker info > /dev/null 2>&1 || die "Docker ne répond pas : lancer Docker Desktop"
[ -n "$(scw config get secret-key 2>/dev/null)" ] || die "scw n'est pas configuré : scw init"
NS_ID=$(namespace_id); export NS_ID
[ -n "$NS_ID" ] || die "Namespace $NAMESPACE absent : ./infrastructure/scaleway/setup.sh $ENV"
# bash 3.2 (celui de macOS) n'a pas de tableaux associatifs : une variable ID_<app> par conteneur.
for app in "${TARGETS[@]}"; do
  printf -v "ID_$app" '%s' "$(container_id "$app")"
  v="ID_$app"; [ -n "${!v}" ] || die "Conteneur $(container_name "$app") absent : ./infrastructure/scaleway/setup.sh $ENV"
done
ok "Docker, scw, namespace et conteneurs"

GIT_SHA=$(git rev-parse HEAD)
TAG="${TAG_PREFIX}-${GIT_SHA}"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  if [ "$ALLOW_DIRTY" = 1 ]; then
    TAG="${TAG}-dirty$(date +%H%M%S)"
    warn "modifications non commitées incluses — image taguée « $TAG »"
  else
    git status --short --untracked-files=no | head -10 | sed 's/^/    /'
    die "Modifications non commitées : commiter, ou relancer avec --allow-dirty"
  fi
fi
[ "$ENV" = "production" ] && [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ] && warn "branche $(git rev-parse --abbrev-ref HEAD) (et non main) envoyée en production"
ok "commit ${GIT_SHA:0:8} — $(git log -1 --format=%s | cut -c1-60)"
preflight_env

# ── 2. Base : sauvegarde puis migrations, AVANT les images ────
# Une API neuve sur une base en retard écrit dans des colonnes absentes, et les 500 arrivent sur
# des écrans sans rapport (leçon de Dedalle). Un échec ici arrête tout : mieux vaut l'ancienne
# image sur une base saine.
if wants api; then
  if [ "$SKIP_MIGRATE" = 1 ]; then
    warn "migrations sautées (--skip-migrate)"
  else
    step "Base de données"
    DB_URL=$(env_value DIRECT_URL); DB_URL=${DB_URL:-$(env_value DATABASE_URL)}
    if [ "$BACKUP" = 1 ]; then
      if command -v pg_dump > /dev/null 2>&1; then
        mkdir -p backups
        DUMP="backups/${ENV}-$(date +%Y%m%d-%H%M%S).dump"
        if pg_dump -Fc --no-owner --no-privileges -f "$DUMP" "${DB_URL%%\?*}" 2>/dev/null; then
          ok "sauvegarde : $DUMP ($(du -h "$DUMP" | cut -f1))"
        else
          rm -f "$DUMP"
          warn "sauvegarde impossible (pg_dump plus ancien que le serveur ? brew install libpq) — on continue"
        fi
      else
        warn "pg_dump absent : pas de sauvegarde (brew install libpq)"
      fi
    fi
    # Seules les URL de base sont exportées : « source » du fichier entier exécuterait les
    # valeurs (un & dans une URL, les espaces du JSON FCM) au lieu de les lire.
    ( DATABASE_URL=$(env_value DATABASE_URL); export DATABASE_URL DIRECT_URL="$DB_URL"
      pnpm --filter @rekonect/api exec prisma generate > /dev/null
      pnpm --filter @rekonect/api exec prisma migrate deploy 2>&1 | sed -E 's#postgres(ql)?://[^ ]+#<url masquée>#g'
      exit "${PIPESTATUS[0]}"
    ) || {
      ko "migrations en échec — rien n'a été déployé"
      echo -e "    P1001 / Can't reach database server : c'est ce poste qui ne joint pas la base (réseau, projet en pause)."
      echo -e "    P3005 (schéma non vide) : ancienne base Supabase jamais marquée →"
      echo -e "      ${BLUE}./infrastructure/scaleway/db-status.sh $ENV --resolve-baseline${NC}"
      echo -e "    Diagnostic : ${BLUE}./infrastructure/scaleway/db-status.sh $ENV${NC}"
      exit 1
    }
    ok "base à jour"
  fi
fi

# ── 3. Images ─────────────────────────────────────────────────
step "Registre"
scw config get secret-key | docker login "rg.${REGION}.scw.cloud" -u nologin --password-stdin > /dev/null
ok "connecté à $REGISTRY"

build_and_push() {
  local image=$1 dockerfile=$2; shift 2
  echo -e "\n${BLUE}━━━ Image $image ($TAG) ━━━${NC}"
  docker build --platform linux/amd64 -f "infrastructure/docker/$dockerfile" "$@" \
    -t "$REGISTRY/$image:$TAG_PREFIX" -t "$REGISTRY/$image:$TAG" .
  docker push -q "$REGISTRY/$image:$TAG"
  docker push -q "$REGISTRY/$image:$TAG_PREFIX"
  ok "$image poussée"
}
wants api      && build_and_push api api.Dockerfile
wants admin    && build_and_push admin next.Dockerfile --build-arg APP=admin
wants partners && build_and_push partners next.Dockerfile --build-arg APP=partners

# ── 4. Conteneurs ─────────────────────────────────────────────
# Une seule mise à jour par conteneur, image ET variables : en deux appels, le second tombe sur
# l'état transitoire du premier (« Transient state error »), et c'est deux rollouts pour un.
# `update` remplace la liste complète des variables : une clé retirée du fichier disparaît.
FAILED=0
deploy_app() {
  local app=$1 v="ID_$1" id image
  id=${!v}
  image="$REGISTRY/$(image_of "$app"):$TAG"
  echo -e "\n${BLUE}━━━ Conteneur $(container_name "$app") ━━━${NC}"
  wait_settled "$id" "$app" || { FAILED=$((FAILED + 1)); return; }
  read_env_file "$app"
  echo -e "  → image ${image##*/} + ${#ENV_ARGS[@]} variables (${ENV_SKIPPED} écartées, sans objet pour $app)"
  scw container container update "$id" region="$REGION" image="$image" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} > /dev/null
  if wait_ready "$id" "$app"; then ok "$app en ligne"; else FAILED=$((FAILED + 1)); fi
}
for app in "${TARGETS[@]}"; do deploy_app "$app"; done

# ── 5. Purge du registre (jamais bloquante) ───────────────────
if [ "$SKIP_PRUNE" != 1 ]; then
  step "Purge des anciennes images"
  "$(dirname "$0")/registry-prune.sh" --keep 3 > /tmp/rekonect-prune.log 2>&1 \
    && ok "$(tail -n1 /tmp/rekonect-prune.log | sed -E $'s/\033\\[[0-9;]*m//g')" \
    || warn "purge en échec (détail : /tmp/rekonect-prune.log) — le déploiement, lui, est fait"
fi

if [ "$FAILED" -gt 0 ]; then
  die "$FAILED conteneur(s) en échec — voir ci-dessus. Revenir à l'image précédente : relancer ce script depuis le commit précédent (les 3 derniers tags sont gardés)."
fi

# ── 6. Test de fumée ──────────────────────────────────────────
if [ "$SMOKE" = 1 ]; then
  "$(dirname "$0")/smoke.sh" "$ENV" || die "Déployé, mais le test de fumée échoue — voir ci-dessus."
fi

echo -e "\n${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Rekonect $ENV déployé (${GIT_SHA:0:8})${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
