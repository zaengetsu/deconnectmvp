#!/bin/bash
# ══════════════════════════════════════════════════════════════
# setup.sh — crée l'infrastructure Scaleway de Rekonect (une fois par environnement)
#
#   ./infrastructure/scaleway/setup.sh production
#   ./infrastructure/scaleway/setup.sh staging
#
# Idempotent : ce qui existe déjà est laissé tel quel. Crée le registre d'images, le namespace
# de l'environnement et quatre conteneurs, d'abord sur une image alpine de remplacement :
# le premier `deploy-local.sh` y pose les vraies images et les variables.
#
#   api       NestJS HTTP + WebSocket /realtime     0 → 2 instances (s'endort sans trafic)
#   worker    outbox, notifications, emails, crons  1 instance, toujours allumée
#   admin     back-office (Next.js)                 0 → 2
#   partners  portail + landing partenaires         0 → 2
#
# Le worker n'a pas de trafic entrant : à 0 instance minimum, Scaleway ne le démarrerait jamais,
# et plus aucune notification, aucun email ni aucun cron ne partirait. D'où min = max = 1.
# ══════════════════════════════════════════════════════════════
set -euo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-}"
require_tools scw jq

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
printf "${BLUE}║  Infrastructure Scaleway Rekonect · %-9s║${NC}\n" "$ENV"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"

step "Registre d'images ($REGISTRY_NAMESPACE)"
if [ -n "$(scw registry namespace list name="$REGISTRY_NAMESPACE" region="$REGION" -o json | jq -r '.[0].id // empty')" ]; then
  ok "existe déjà"
else
  scw registry namespace create name="$REGISTRY_NAMESPACE" is-public=false region="$REGION" > /dev/null
  ok "créé (privé)"
fi

step "Namespace $NAMESPACE"
NS_ID=$(namespace_id)
if [ -n "$NS_ID" ]; then
  ok "existe déjà ($NS_ID)"
else
  NS_ID=$(scw container namespace create name="$NAMESPACE" description="Rekonect $ENV" region="$REGION" -o json | jq -r '.id')
  ok "créé ($NS_ID)"
  # Le namespace doit être prêt avant d'y créer des conteneurs.
  for _ in $(seq 1 30); do
    [ "$(scw container namespace get "$NS_ID" region="$REGION" -o json | jq -r .status)" = "ready" ] && break
    sleep 2
  done
fi
export NS_ID

# La CLI a renommé ses options (cpu-limit → mvcpu-limit, memory-limit en Mo → memory-limit-bytes,
# http-option → https-connections-only) et ajouté les sondes HTTP : on s'adapte à la version installée.
if scw container container create -h 2>&1 | grep -q 'mvcpu-limit'; then CLI_NEW=1; else CLI_NEW=0; fi

# Ressources par conteneur : couples mvCPU / Mo acceptés par Scaleway.
create_container() {
  local app=$1 min=$2 max=$3 cpu=$4 mem=$5 timeout=$6 probe=$7
  local name id out res=() extra=()
  name=$(container_name "$app")
  id=$(container_id "$app")
  if [ -n "$id" ]; then
    ok "$name existe déjà ($id)"
    return
  fi
  if [ "$CLI_NEW" = 1 ]; then
    # memory-limit-bytes n'accepte que des Go (« 1GB », « 0.5GB ») : la CLI refuse les octets.
    res=(mvcpu-limit="$cpu" memory-limit-bytes="$(awk -v m="$mem" 'BEGIN { printf "%gGB", m / 1024 }')")
    # Sonde HTTP : un conteneur qui écoute mais ne joint plus la base est redémarré.
    extra=(https-connections-only=true liveness-probe.http.path="$probe" liveness-probe.interval=30s liveness-probe.failure-threshold=3)
  else
    res=(cpu-limit="$cpu" memory-limit="$mem")
    extra=(http-option=redirected)
  fi
  local base=(namespace-id="$NS_ID" name="$name" region="$REGION" image=docker.io/library/alpine:latest
              port=3000 min-scale="$min" max-scale="$max" timeout="$timeout" privacy=public)
  # Du plus précis au plus simple : si Scaleway refuse une option (version de CLI, couple
  # CPU/mémoire), on retombe sur ses valeurs par défaut plutôt que d'arrêter l'installation.
  if out=$(scw container container create "${base[@]}" "${res[@]}" "${extra[@]}" -o json 2>&1); then
    ok "$name créé — $min→$max instance(s), $cpu mvCPU / $mem Mo, sonde $probe"
  elif out=$(scw container container create "${base[@]}" "${extra[@]}" -o json 2>&1); then
    warn "$name créé avec CPU/mémoire par défaut (refus de $cpu mvCPU / $mem Mo) — à ajuster dans la console"
  elif out=$(scw container container create "${base[@]}" -o json 2>&1); then
    warn "$name créé sans sonde ni ressources personnalisées — à ajuster dans la console"
  else
    die "création de $name impossible : $out"
  fi
}

step "Conteneurs"
# API : 15 min de délai de requête, le maximum, pour que les WebSocket ne soient pas coupés à
# chaque minute (socket.io se reconnecte de toute façon).
create_container api      0 "$API_MAX_SCALE" 560 1024 900s /health
create_container worker   1 1                280 512  300s /health
create_container admin    0 2                280 512  60s  /login
create_container partners 0 2                280 512  60s  /login

echo -e "\n${GREEN}✓ Infrastructure $ENV prête.${NC}"
echo -e "  Suite :"
echo -e "   1. ${BLUE}cp .env.production.example $ENV_FILE${NC} et le remplir"
echo -e "      (les domaines natifs ci-dessous servent d'URL publiques en attendant les vôtres) ;"
echo -e "   2. ${BLUE}./infrastructure/scaleway/deploy-local.sh $ENV${NC}"
echo -e "   3. domaines personnalisés : ${BLUE}./infrastructure/scaleway/domains.sh $ENV${NC}"
echo
for app in "${APPS[@]}"; do
  id=$(container_id "$app")
  printf "   %-10s https://%s\n" "$app" "$(container_domain "$id")"
done
