#!/bin/bash
# ══════════════════════════════════════════════════════════════
# domains.sh — rattacher les domaines personnalisés aux conteneurs (repris de Dedalle)
#
#   ./infrastructure/scaleway/domains.sh production            # état des lieux, ne crée rien
#   ./infrastructure/scaleway/domains.sh production --create   # rattache ceux dont le CNAME est en place
#
# Les domaines sont lus dans le fichier d'environnement (PUBLIC_API_URL, WEB_ADMIN_URL,
# WEB_PARTNERS_URL) : une seule source de vérité. L'ordre n'est pas négociable : Scaleway vérifie
# que le CNAME pointe déjà chez lui avant d'émettre le certificat Let's Encrypt. Déclaré trop tôt,
# le domaine part en erreur et il faut le supprimer puis le recréer.
#
# Bascule sans coupure : laisser d'abord les URL natives *.scw.cloud dans le fichier, rattacher
# les domaines, attendre « ready », PUIS mettre les nouvelles URL dans le fichier et redéployer
# (les fronts ont l'URL de l'API, l'API a celles des fronts dans CORS_ORIGINS et les emails).
# ══════════════════════════════════════════════════════════════
set -uo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-}"; shift || true
CREATE=false
EXTRA=()
for arg in "$@"; do
  case "$arg" in
    --create) CREATE=true ;;
    *=*) EXTRA+=("$arg") ;;   # api=api.rekonect.app : rattacher avant de mettre l'URL dans le fichier
    *) die "Argument inconnu : $arg" ;;
  esac
done
require_tools scw jq dig
require_env_file
NS_ID=$(namespace_id); export NS_ID
EXISTING=$(scw container domain list region="$REGION" -o json 2>/dev/null)
host_of() { printf '%s' "${1#http*://}" | cut -d/ -f1; }

TODO=()
plan() {   # $1 = app, $2 = URL publique voulue
  local app=$1 url=$2 host id native apex label resolved st
  [ -z "$url" ] && return
  host=$(host_of "$url")
  case "$host" in *.scw.cloud) return ;; esac   # domaine natif : rien à rattacher
  echo -e "\n${BLUE}━━━ $app → $host ━━━${NC}"
  id=$(container_id "$app")
  [ -n "$id" ] || { ko "aucun conteneur $(container_name "$app")"; return; }
  native=$(container_domain "$id")
  [ -n "$native" ] || { ko "domaine natif inconnu pour $(container_name "$app") (jamais déployé ?)"; return; }

  if printf '%s' "$EXISTING" | jq -e --arg h "$host" '.[] | select(.hostname == $h)' > /dev/null 2>&1; then
    st=$(printf '%s' "$EXISTING" | jq -r --arg h "$host" '.[] | select(.hostname == $h) | .status')
    ok "déjà déclaré (statut : $st)"
    return
  fi
  apex=$(printf '%s' "$host" | awk -F. '{print $(NF-1)"."$NF}')
  label=${host%".$apex"}
  echo -e "  ${YELLOW}Enregistrement à créer dans la zone ${apex} :${NC}"
  echo -e "      ${label}    CNAME    ${native}."
  resolved=$(dig +short CNAME "$host" 2>/dev/null | sed 's/\.$//')
  [ -z "$resolved" ] && resolved=$(dig +short "$host" 2>/dev/null | head -n1)
  if [ -z "$resolved" ]; then ko "$host ne résout pas encore — Scaleway refuserait le certificat"
  elif [ "$resolved" = "$native" ]; then ok "le CNAME pointe bien sur $native"; TODO+=("$id|$host")
  else warn "$host résout vers « $resolved » et non « $native » (un A au lieu d'un CNAME ?)"; fi
}

echo -e "${BLUE}Environnement : $ENV — domaines lus dans $ENV_FILE${NC}"
plan api      "$(env_value PUBLIC_API_URL)"
plan admin    "$(env_value WEB_ADMIN_URL)"
plan partners "$(env_value WEB_PARTNERS_URL)"
for pair in ${EXTRA[@]+"${EXTRA[@]}"}; do plan "${pair%%=*}" "https://${pair#*=}"; done

echo
if [ ${#TODO[@]} -eq 0 ]; then
  echo -e "${YELLOW}Rien à rattacher pour l'instant.${NC} Poser les CNAME ci-dessus, attendre que"
  echo -e "« dig +short <hôte> » réponde (5 à 30 min), puis relancer avec --create."
  exit 0
fi
if [ "$CREATE" != true ]; then
  echo -e "${GREEN}${#TODO[@]} domaine(s) prêt(s).${NC} Relancer avec --create pour les rattacher."
  exit 0
fi
for entry in "${TODO[@]}"; do
  id=${entry%%|*}; host=${entry#*|}
  if scw container domain create container-id="$id" hostname="$host" region="$REGION" > /dev/null; then ok "$host déclaré"
  else ko "échec sur $host"; fi
done

echo -e "\n${BLUE}Émission des certificats par Scaleway…${NC}"
DEADLINE=$((SECONDS + 420))
while [ $SECONDS -lt $DEADLINE ]; do
  PENDING=$(scw container domain list region="$REGION" -o json 2>/dev/null | jq -r '[.[] | select(.status != "ready" and .status != "error")] | length')
  [ "${PENDING:-0}" = "0" ] && break
  printf "\r  %s domaine(s) en cours…   " "$PENDING"; sleep 10
done
printf "\r%*s\r" 50 ""
scw container domain list region="$REGION" -o json 2>/dev/null | jq -r '.[] | "\(.status)\t\(.hostname)\t\(.error_message // "")"' \
  | while IFS=$'\t' read -r st host err; do
      case "$st" in
        ready) ok "https://$host — certificat en place" ;;
        error) ko "$host — $err" ;;
        *)     warn "$host encore en « $st »" ;;
      esac
    done
