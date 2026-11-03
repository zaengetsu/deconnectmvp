#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Rekonect — fonctions communes aux scripts Scaleway (fichier sourcé, pas exécuté)
#
# Même organisation que Dedalle (Serverless Containers + registre Scaleway), avec trois
# différences propres à Rekonect :
#   · un 4ᵉ conteneur, `worker` (relais outbox, notifications, emails, crons), toujours allumé :
#     même image que l'API, lancé avec REKONECT_PROCESS=worker ;
#   · les conteneurs sont retrouvés par leur nom, jamais par un identifiant écrit en dur ;
#   · la base passe par le pooler Supabase en mode **session** (LISTEN/NOTIFY), pas transaction.
# ══════════════════════════════════════════════════════════════

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR" || exit 1

REGION="${SCW_DEFAULT_REGION:-fr-par}"
REGISTRY_NAMESPACE="rekonect-registry"
REGISTRY="rg.${REGION}.scw.cloud/${REGISTRY_NAMESPACE}"
APPS=(api worker admin partners)

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
ko()    { echo -e "  ${RED}✗${NC} $1"; }
step()  { echo -e "\n${BLUE}▸ $1${NC}"; }
die()   { echo -e "\n${RED}✗ $1${NC}" >&2; exit 1; }

# ── Environnement ─────────────────────────────────────────────
# production → namespace rekonect-prod, conteneurs api / worker / admin / partners, .env.production
# staging    → namespace rekonect-staging, conteneurs api-staging…, .env.staging
select_env() {
  ENV="${1:-}"
  case "$ENV" in
    production) ENV_FILE=".env.production"; NAMESPACE="rekonect-prod";    SUFFIX="";         TAG_PREFIX="main" ;;
    staging)    ENV_FILE=".env.staging";    NAMESPACE="rekonect-staging"; SUFFIX="-staging"; TAG_PREFIX="staging" ;;
    *) die "Environnement inconnu : « ${ENV} » (production | staging)" ;;
  esac
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE introuvable. Partir du modèle : cp .env.production.example $ENV_FILE"
}

# Lit une variable du fichier d'environnement sans l'exécuter.
env_value() {
  # `|| true` : une variable absente (DIRECT_URL, facultative) n'est pas une erreur ; sans lui,
  # pipefail + set -e arrêtent l'appelant sans le moindre message.
  { grep -E "^$1=" "$ENV_FILE" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}

require_tools() {
  local bin
  for bin in "$@"; do
    command -v "$bin" > /dev/null 2>&1 || die "$bin introuvable (brew install $bin)"
  done
}

# ── Images et conteneurs ──────────────────────────────────────
image_of() {   # l'image construite pour une application (le worker partage celle de l'API)
  case "$1" in worker) echo api ;; *) echo "$1" ;; esac
}

container_name() { echo "$1$SUFFIX"; }

namespace_id() {
  scw container namespace list name="$NAMESPACE" region="$REGION" -o json 2>/dev/null | jq -r '.[0].id // empty'
}

# Identifiant d'un conteneur, retrouvé par son nom dans le namespace de l'environnement.
container_id() {
  local ns
  ns=${NS_ID:-$(namespace_id)}
  [ -n "$ns" ] || return 0
  scw container container list namespace-id="$ns" region="$REGION" -o json 2>/dev/null \
    | jq -r --arg n "$(container_name "$1")" '.[] | select(.name == $n) | .id' | head -n1
}

container_json()   { scw container container get "$1" region="$REGION" -o json 2>/dev/null; }
container_status() { container_json "$1" | jq -r '.status // "unknown"'; }
container_error()  { container_json "$1" | jq -r '.error_message // "(pas de message)"'; }
# Les CLI récentes (2.62) exposent `public_endpoint` (avec le schéma) au lieu de `domain_name`.
container_domain() { container_json "$1" | jq -r '.domain_name // .public_endpoint // empty' | sed -E 's#^https?://##'; }

# ── Variables : lesquelles vont dans quel conteneur ───────────
# L'API et le worker lisent tout, sauf ce qui est inliné au build des fronts (NEXT_PUBLIC_*, VITE_*)
# et ce qui ne sert qu'au poste qui déploie (DIRECT_URL : migrations). Admin et Partenaires ne
# reçoivent que les NEXT_PUBLIC_* : un front n'a rien à faire de DATABASE_URL ni de la clé Stripe,
# et le jour où il fuite, il ne fuite rien d'autre.
env_belongs_to() {
  local key=$1 app=$2
  case "$key" in REKONECT_PROCESS|WORKER_HTTP_PORT|RUN_JOBS|PORT) return 1 ;; esac   # posées par le script
  case "$app" in
    api|worker) [[ "$key" != NEXT_PUBLIC_* && "$key" != VITE_* && "$key" != DIRECT_URL ]] ;;
    admin|partners) [[ "$key" == NEXT_PUBLIC_* ]] ;;
    *) return 1 ;;
  esac
}

# Remplit ENV_ARGS avec les variables de l'application, au format attendu par `scw`.
# Découpe au **premier** `=` (une URL Postgres ou une clé base64 en contiennent d'autres) et
# tableau plutôt que chaîne + eval (une valeur avec espace, guillemet ou `$` cassait la commande).
read_env_file() {
  local app=$1 line key value
  ENV_ARGS=()
  ENV_SKIPPED=0
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "${line//[[:space:]]/}" || "$line" =~ ^[[:space:]]*# ]] && continue
    key=${line%%=*}
    value=${line#*=}
    key=$(echo "$key" | xargs)
    [[ -z "$key" ]] && continue
    if ! env_belongs_to "$key" "$app"; then
      ENV_SKIPPED=$((ENV_SKIPPED + 1))
      continue
    fi
    value=$(printf '%s' "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")
    ENV_ARGS+=("secret-environment-variables.${key}=${value}")
  done < "$ENV_FILE"
  # Ce qui distingue l'API du worker : le même code, un autre point d'entrée.
  case "$app" in
    api)    ENV_ARGS+=("environment-variables.REKONECT_PROCESS=api" "environment-variables.RUN_JOBS=false") ;;
    worker) ENV_ARGS+=("environment-variables.REKONECT_PROCESS=worker" "environment-variables.RUN_JOBS=true" "environment-variables.WORKER_HTTP_PORT=3000") ;;
  esac
}

# ── Attente des états stables ─────────────────────────────────
# `ready` et `error` sont stables : on rend la main dans les deux cas. Refuser de toucher un
# conteneur en erreur interdirait précisément le déploiement qui le répare (leçon de Dedalle).
wait_settled() {
  local id=$1 label=$2 deadline=$((SECONDS + 300)) status=""
  while [ $SECONDS -lt $deadline ]; do
    status=$(container_status "$id")
    case "$status" in
      ready) printf "\r%*s\r" 60 ""; return 0 ;;
      error) printf "\r%*s\r" 60 ""; warn "$label était en erreur : $(container_error "$id") — on déploie quand même"; return 0 ;;
      *) printf "\r  %s : %s…   " "$label" "$status"; sleep 5 ;;
    esac
  done
  echo; ko "$label toujours en « $status » après 5 min"
  return 1
}

# Après un déploiement, `error` est un échec.
wait_ready() {
  local id=$1 label=$2
  wait_settled "$id" "$label" || return 1
  if [ "$(container_status "$id")" != "ready" ]; then
    ko "$label n'a pas démarré : $(container_error "$id")"
    echo -e "    Journaux : console Scaleway → Serverless Containers → $NAMESPACE → $label → Logs."
    echo -e "    « unable to start » = le process est mort au démarrage (variable manquante : l'API"
    echo -e "    valide sa configuration et s'arrête avec la liste des clés fautives)."
    return 1
  fi
}

# ── Contrôles du fichier d'environnement avant tout envoi ─────
# Chaque règle correspond à une panne qui ne se voit qu'une fois en ligne.
preflight_env() {
  local errors=0 v api admin partners cors
  bad()  { ko "$1"; errors=$((errors + 1)); }

  [ "$(env_value NODE_ENV)" = "production" ] || bad "NODE_ENV doit valoir production (staging compris : c'est le mode d'exécution, APP_ENV porte l'environnement)"
  v=$(env_value APP_ENV)
  [ "$v" = "$ENV" ] || bad "APP_ENV=« $v » alors qu'on déploie $ENV (libellé affiché dans le back-office)"

  v=$(env_value DATABASE_URL)
  if [ -z "$v" ]; then bad "DATABASE_URL vide"
  elif [[ "$v" == *":6543"* || "$v" == *"pgbouncer=true"* ]]; then
    bad "DATABASE_URL passe par le pooler en mode transaction (6543) : LISTEN/NOTIFY (temps réel, réveil du worker) n'y fonctionne pas. Prendre le pooler en mode session : …pooler.supabase.com:5432"
  elif [[ "$v" == *"@db."*".supabase.co"* ]]; then
    warn "DATABASE_URL vise la connexion directe db.<ref>.supabase.co, joignable en IPv6 seulement : depuis Scaleway, préférer le pooler en mode session (Supabase › Connect › Session pooler)"
  fi

  v=$(env_value JWT_ACCESS_SECRET)
  if [ ${#v} -lt 32 ]; then bad "JWT_ACCESS_SECRET : 32 caractères minimum (openssl rand -base64 48)"
  elif [[ "$v" == change-me* ]]; then bad "JWT_ACCESS_SECRET est encore la valeur d'exemple"; fi

  api=$(env_value PUBLIC_API_URL); admin=$(env_value WEB_ADMIN_URL); partners=$(env_value WEB_PARTNERS_URL)
  for pair in "PUBLIC_API_URL=$api" "WEB_ADMIN_URL=$admin" "WEB_PARTNERS_URL=$partners" "NEXT_PUBLIC_API_URL=$(env_value NEXT_PUBLIC_API_URL)"; do
    v=${pair#*=}
    case "$v" in
      https://*localhost*|https://127.*) bad "${pair%%=*} pointe sur la machine locale : $v" ;;
      https://*) ;;
      *) bad "${pair%%=*} doit être une URL https publique (trouvé : « ${v:-vide} »)" ;;
    esac
  done
  [ "$(env_value NEXT_PUBLIC_API_URL)" = "$api" ] || warn "NEXT_PUBLIC_API_URL ($(env_value NEXT_PUBLIC_API_URL)) diffère de PUBLIC_API_URL ($api)"
  [[ "$api" == */ || "$admin" == */ || "$partners" == */ ]] && bad "Les URL publiques s'écrivent sans / final (les liens des emails le doublent)"

  # Le navigateur bloque silencieusement ce que curl laisse passer : on vérifie l'origine de
  # chaque front, et celles de l'app mobile (Capacitor iOS et Android).
  cors=",$(env_value CORS_ORIGINS | tr -d ' '),"
  for v in "$admin" "$partners" "capacitor://localhost" "http://localhost"; do
    [[ -n "$v" && "$cors" == *",$v,"* ]] || bad "CORS_ORIGINS ne contient pas $v"
  done

  v=$(env_value NOTIFICATIONS_ENGINE)
  [ "${v:-api}" = "api" ] || bad "NOTIFICATIONS_ENGINE=$v : la phase 3 est livrée, le worker et les triggers SQL enverraient en double (docs/architecture.md §7)"

  v=$(env_value STRIPE_SECRET_KEY)
  if [ -z "$v" ]; then warn "STRIPE_SECRET_KEY vide : abonnements et paiements désactivés"
  elif [ "$ENV" = "production" ] && [[ "$v" == sk_test_* ]]; then warn "STRIPE_SECRET_KEY est une clé de test en production"; fi
  [ -n "$(env_value STRIPE_WEBHOOK_SECRET)" ] || warn "STRIPE_WEBHOOK_SECRET vide : les webhooks Stripe seront refusés (endpoint : $api/v1/billing/webhook)"
  [ -n "$(env_value BREVO_API_KEY)" ] || warn "BREVO_API_KEY vide : aucun email ne partira (bienvenue, mot de passe oublié, invitations…)"
  [ -n "$(env_value APNS_PRIVATE_KEY)" ] || warn "APNS_* vides : pas de push iOS"
  v=$(env_value FCM_SERVICE_ACCOUNT_JSON)
  if [ -z "$v" ]; then warn "FCM_SERVICE_ACCOUNT_JSON vide : pas de push Android"
  elif ! printf '%s' "$v" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' 2>/dev/null; then
    bad "FCM_SERVICE_ACCOUNT_JSON n'est pas un JSON valide sur une seule ligne (jq -c . service-account.json)"
  fi
  [ -n "$(env_value SUPABASE_JWT_SECRET)" ] && warn "SUPABASE_JWT_SECRET renseigné : le pont des anciennes versions mobiles reste ouvert (à vider quand tout le monde a mis à jour)"

  # Connexions Postgres : chaque instance d'API et le worker ouvrent un pool + une connexion LISTEN.
  v=$(env_value DATABASE_POOL_MAX); v=${v:-10}
  local total=$(( (API_MAX_SCALE + 1) * (v + 1) ))
  echo -e "  ${BLUE}ℹ${NC} connexions Postgres au pic : ($API_MAX_SCALE API + 1 worker) × ($v + 1) = $total — doit rester sous la taille du pool Supabase (Settings › Database › Pool size)"

  if [ "$errors" -gt 0 ]; then
    die "$errors problème(s) dans $ENV_FILE — rien n'a été envoyé."
  fi
  ok "$ENV_FILE cohérent"
}

# Échelle des conteneurs (setup.sh l'applique, preflight_env s'en sert pour compter les connexions).
API_MAX_SCALE=2
