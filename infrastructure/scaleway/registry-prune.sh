#!/bin/bash
# ══════════════════════════════════════════════════════════════
# registry-prune.sh — purge des anciennes images du registre Scaleway (repris de Dedalle)
#
#   ./infrastructure/scaleway/registry-prune.sh [--keep N] [--dry-run]
#
# Chaque déploiement pousse un tag mobile (`main`, `staging`) et un tag figé par commit
# (`main-<sha>`). Sans purge, le registre grossit d'une image par déploiement, facturée au Go·mois.
# On garde, par image : les tags mobiles, le tag que chaque conteneur sert en ce moment (lu sur
# le conteneur, jamais deviné) et les N tags de commit les plus récents (3 par défaut, de quoi
# revenir en arrière). Tout le reste est supprimé.
# ══════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_tools scw jq

KEEP=3
DRY_RUN="${DRY_RUN:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    --keep=*) KEEP="${1#--keep=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Argument inconnu : $1" ;;
  esac
done
case "$KEEP" in ''|*[!0-9]*) die "--keep attend un entier" ;; esac

# Images servies, tous namespaces confondus (production et staging partagent le registre). Si la
# liste ne se lit pas, on s'arrête : purger sans connaître l'état déployé, c'est risquer de
# retirer l'image qu'un retour arrière demanderait dans l'heure.
CONTAINERS_JSON=$(scw container container list region="$REGION" -o json) || die "lecture des conteneurs impossible — purge annulée"
IN_USE=""
for id in $(printf '%s' "$CONTAINERS_JSON" | jq -r '.[].id'); do
  img=$(container_json "$id" | jq -r '.image // .registry_image // empty') || die "conteneur $id illisible — purge annulée"
  [ -n "$img" ] && IN_USE+="$img"$'\n'
done
[ -n "$IN_USE" ] || die "aucun conteneur ne déclare d'image — purge annulée"

NS=$(scw registry namespace list name="$REGISTRY_NAMESPACE" region="$REGION" -o json | jq -r '.[0].id // empty')
[ -n "$NS" ] || die "registre $REGISTRY_NAMESPACE introuvable"

deleted=0; kept=0
while read -r image_id image_name; do
  [ -n "$image_id" ] || continue
  echo -e "${BLUE}→ $image_name${NC}"
  kept_sha=0
  while read -r tag; do
    [ -n "$tag" ] || continue
    tag_id=$(printf '%s' "$tag" | jq -r .id)
    tag_name=$(printf '%s' "$tag" | jq -r .name)
    reason=""
    if ! [[ "$tag_name" =~ -[0-9a-f]{40}(-dirty[0-9]+)?$ ]]; then reason="tag mobile"
    elif printf '%s' "$IN_USE" | grep -qx ".*/${image_name}:${tag_name}"; then reason="servi par un conteneur"
    elif [ "$kept_sha" -lt "$KEEP" ]; then kept_sha=$((kept_sha + 1)); reason="parmi les $KEEP plus récents"
    fi
    if [ -n "$reason" ]; then
      kept=$((kept + 1)); printf "  %-62s garde (%s)\n" "$tag_name" "$reason"; continue
    fi
    deleted=$((deleted + 1))
    if [ "$DRY_RUN" = 1 ]; then printf "  %-62s ${YELLOW}à supprimer${NC}\n" "$tag_name"
    else scw registry tag delete "$tag_id" region="$REGION" > /dev/null; printf "  %-62s ${GREEN}supprimé${NC}\n" "$tag_name"; fi
  done < <(scw registry tag list image-id="$image_id" region="$REGION" -o json | jq -c 'sort_by(.updated_at) | reverse | .[] | {id, name}')
done < <(scw registry image list namespace-id="$NS" region="$REGION" -o json | jq -r '.[] | "\(.id) \(.name)"')

if [ "$DRY_RUN" = 1 ]; then echo -e "${YELLOW}Simulation : $deleted tag(s) à supprimer, $kept gardés.${NC}"
else echo -e "${GREEN}Registre : $deleted tag(s) supprimé(s), $kept gardé(s).${NC}"; fi
