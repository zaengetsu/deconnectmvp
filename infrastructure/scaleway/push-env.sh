#!/bin/bash
# ══════════════════════════════════════════════════════════════
# push-env.sh — renvoyer les variables d'environnement sans reconstruire d'image
#
#   ./infrastructure/scaleway/push-env.sh production            # les quatre conteneurs
#   ./infrastructure/scaleway/push-env.sh production api worker
#
# Pour une clé changée (Stripe, Brevo, APNs…) : l'image servie reste la même, seules les
# variables changent. Attention, pour admin et partners, les NEXT_PUBLIC_* sont substituées au
# démarrage : les renvoyer suffit, pas besoin de rebuild.
# ══════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-}"; shift || true
require_tools scw jq node
require_env_file
TARGETS=("$@"); [ ${#TARGETS[@]} -eq 0 ] && TARGETS=("${APPS[@]}")
NS_ID=$(namespace_id); export NS_ID
[ -n "$NS_ID" ] || die "Namespace $NAMESPACE absent : ./infrastructure/scaleway/setup.sh $ENV"

step "Contrôles"
preflight_env

FAILED=0
for app in "${TARGETS[@]}"; do
  id=$(container_id "$app")
  [ -n "$id" ] || { ko "conteneur $(container_name "$app") absent"; FAILED=$((FAILED + 1)); continue; }
  step "$(container_name "$app")"
  wait_settled "$id" "$app" || { FAILED=$((FAILED + 1)); continue; }
  read_env_file "$app"
  echo -e "  → ${#ENV_ARGS[@]} variables (${ENV_SKIPPED} écartées)"
  # La mise à jour déclenche déjà le redéploiement : pas de `redeploy` derrière, il tomberait
  # sur l'état transitoire (« Transient state error »).
  scw container container update "$id" region="$REGION" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} > /dev/null
  if wait_ready "$id" "$app"; then ok "$app à jour"; else FAILED=$((FAILED + 1)); fi
done
[ "$FAILED" -eq 0 ] || die "$FAILED conteneur(s) en échec"
echo -e "\n${GREEN}✓ Variables $ENV envoyées.${NC}"
