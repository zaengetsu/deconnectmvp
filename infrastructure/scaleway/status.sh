#!/bin/bash
# ══════════════════════════════════════════════════════════════
# status.sh — l'état complet d'un environnement, en une commande
#
#   ./infrastructure/scaleway/status.sh production
#
# Quatre couches, dans l'ordre où elles cassent : conteneurs (tournent-ils, sur quelle image),
# domaines (certificats), application (smoke.sh), base (db-status.sh).
# ══════════════════════════════════════════════════════════════
set -uo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-production}"
require_tools scw jq

echo -e "${BLUE}━━━ Conteneurs · $NAMESPACE ━━━${NC}"
NS_ID=$(namespace_id); export NS_ID
[ -n "$NS_ID" ] || die "namespace $NAMESPACE absent : ./infrastructure/scaleway/setup.sh $ENV"
for app in "${APPS[@]}"; do
  id=$(container_id "$app")
  if [ -z "$id" ]; then ko "$(container_name "$app") absent"; continue; fi
  detail=$(container_json "$id")
  st=$(printf '%s' "$detail" | jq -r '.status // "?"')
  img=$(printf '%s' "$detail" | jq -r '(.image // .registry_image // "?") | split("/") | last')
  scale=$(printf '%s' "$detail" | jq -r '"\(.min_scale)→\(.max_scale)"')
  case "$st" in
    ready) ok "$(printf '%-18s %-6s %s' "$(container_name "$app")" "$scale" "$img")" ;;
    error) ko "$(container_name "$app") — $(printf '%s' "$detail" | jq -r '.error_message // ""')" ;;
    *)     warn "$(container_name "$app") ($st) — $img" ;;
  esac
  [[ "$img" == alpine* ]] && echo -e "     ${YELLOW}↑ jamais déployé (image alpine de setup.sh)${NC}"
done

echo -e "\n${BLUE}━━━ Domaines ━━━${NC}"
scw container domain list region="$REGION" -o json 2>/dev/null | jq -r '.[] | "\(.status)\t\(.hostname)\t\(.error_message // "")"' \
  | while IFS=$'\t' read -r st host err; do
      case "$st" in
        ready) ok "https://$host" ;;
        error) ko "$host — $err" ;;
        *)     warn "$host ($st) — certificat en cours" ;;
      esac
    done

[ -f "$ENV_FILE" ] || { warn "$ENV_FILE absent : test de fumée et état de la base sautés"; exit 0; }
"$(dirname "$0")/smoke.sh" "$ENV"
"$(dirname "$0")/db-status.sh" "$ENV" || true
