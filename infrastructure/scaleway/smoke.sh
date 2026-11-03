#!/bin/bash
# ══════════════════════════════════════════════════════════════
# smoke.sh — un déploiement sert-il vraiment quelque chose ?
#
#   ./infrastructure/scaleway/smoke.sh production
#   ./infrastructure/scaleway/smoke.sh staging
#
# « Conteneur vert » veut seulement dire qu'un processus écoute. Les vérifications ci-dessous
# sont celles qu'un simple code HTTP ferait passer au vert sur une panne réelle :
#   API       santé + base, route publique (migrations jouées), CORS des deux fronts et de
#             l'app mobile, temps réel (socket.io), webhook Stripe routé
#   worker    sonde de santé (sans lui : ni notification, ni email, ni cron)
#   fronts    page 200, fichiers /_next/static servis, placeholders substitués, bonne URL d'API
# Aucun secret n'est lu : seulement les URL publiques du fichier d'environnement.
# ══════════════════════════════════════════════════════════════
set -uo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-}"
require_tools curl jq
require_env_file
FAILED=0
bad() { ko "$1"; FAILED=$((FAILED + 1)); }

API_URL=$(env_value PUBLIC_API_URL)
ADMIN_URL=$(env_value WEB_ADMIN_URL)
PARTNERS_URL=$(env_value WEB_PARTNERS_URL)

# Repli sur le domaine natif *.scw.cloud quand le domaine personnalisé ne répond pas encore
# (DNS, certificat) : un `000` de curl ne dit rien de l'application, seulement du chemin.
reachable() { [ "$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$1/" 2>/dev/null)" != "000" ]; }
native_url() {
  command -v scw > /dev/null 2>&1 || return 0
  local id; id=$(container_id "$1"); [ -n "$id" ] || return 0
  local d; d=$(container_domain "$id"); [ -n "$d" ] && printf 'https://%s' "$d"
}
resolve() {   # $1 = app, $2 = URL voulue → URL effectivement testée
  local app=$1 url=$2 alt
  if [ -n "$url" ] && reachable "$url"; then printf '%s' "$url"; return; fi
  alt=$(native_url "$app")
  if [ -n "$alt" ]; then
    echo -e "  ${YELLOW}⚠${NC} ${url:-URL vide} injoignable — repli sur $alt" >&2
    printf '%s' "$alt"
  else
    printf '%s' "$url"
  fi
}

# ── API ───────────────────────────────────────────────────────
echo -e "\n${BLUE}━━━ API · $API_URL ━━━${NC}"
API=$(resolve api "$API_URL")
code=$(curl -s -m 30 -o /tmp/rk-health -w '%{http_code}' "$API/health")
if [ "$code" = "200" ]; then ok "/health → 200 (l'API joint la base)"
else bad "/health → $code $(head -c 200 /tmp/rk-health 2>/dev/null)"; fi

# Route publique qui lit des tables créées par les migrations : 200 = schéma en place.
code=$(curl -s -m 30 -o /tmp/rk-plans -w '%{http_code}' "$API/v1/billing/plans?audience=partner")
if [ "$code" = "200" ]; then
  n=$(jq 'if type == "array" then length else (.items // .plans // []) | length end' /tmp/rk-plans 2>/dev/null || echo "?")
  ok "/v1/billing/plans → 200 ($n plan(s) partenaire)"
  [ "$n" = "0" ] && warn "aucun plan partenaire : base migrée mais catalogue non chargé (prisma:seed ?)"
else bad "/v1/billing/plans → $code · si /health est vert, ce sont les migrations qui manquent"; fi

# CORS : sans l'en-tête, le navigateur bloque tout, alors que curl passe.
for origin in "$ADMIN_URL" "$PARTNERS_URL" "capacitor://localhost" "http://localhost"; do
  [ -n "$origin" ] || continue
  allow=$(curl -s -m 20 -o /dev/null -D - -X OPTIONS -H "Origin: $origin" -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type" "$API/v1/auth/login" \
    | tr -d '\r' | grep -i '^access-control-allow-origin:' | head -n1 | cut -d' ' -f2-)
  if [ "$allow" = "$origin" ]; then ok "CORS $origin"
  else bad "CORS : $origin refusé (CORS_ORIGINS du conteneur api)"; fi
done

# Temps réel : la poignée de main socket.io (namespace /realtime) répond « 0{…} ».
body=$(curl -s -m 20 "$API/socket.io/?EIO=4&transport=polling" | head -c 120)
if [[ "$body" == 0\{* ]]; then ok "socket.io répond (WebSocket /realtime)"
else bad "socket.io ne répond pas : « ${body:-rien} »"; fi

# Webhook Stripe : sans signature, l'API doit refuser (400), pas ignorer la route (404).
code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "$API/v1/billing/webhook")
case "$code" in
  400|401|403) ok "webhook Stripe routé (requête non signée refusée : $code)" ;;
  *) bad "webhook Stripe : $code (attendu 400 sans signature)" ;;
esac

# ── Worker ────────────────────────────────────────────────────
echo -e "\n${BLUE}━━━ Worker ━━━${NC}"
W=$(native_url worker)
if [ -z "$W" ]; then warn "domaine du worker introuvable (scw absent ou conteneur inconnu) — non vérifié"
else
  body=$(curl -s -m 30 "$W/health")
  if [[ "$body" == *'"process":"worker"'* && "$body" == *'"ok"'* ]]; then ok "worker vivant et relié à la base"
  else bad "worker : « ${body:-pas de réponse} » — plus aucune notification, aucun email ni cron ne part"; fi
fi

# ── Fronts Next.js ────────────────────────────────────────────
check_next() {
  local label=$1 app=$2 want=$3 url page code asset acode chunks
  echo -e "\n${BLUE}━━━ $label · $want ━━━${NC}"
  url=$(resolve "$app" "$want")
  page=$(curl -sL -m 30 -w '\n%{http_code}' "$url/login" 2>/dev/null)
  code=$(printf '%s' "$page" | tail -n1); page=$(printf '%s' "$page" | sed '$d')
  if [ "$code" != "200" ]; then bad "/login → ${code:-pas de réponse}"; return; fi
  ok "/login → 200"

  # Un chunk statique doit répondre 200 : sinon le serveur standalone ne trouve pas ses fichiers
  # et la page arrive sans style ni JavaScript (piège vécu sur Dedalle).
  asset=$(printf '%s' "$page" | grep -oE '/_next/static/[^"'"'"' ]+\.(js|css)' | head -n1)
  if [ -z "$asset" ]; then bad "aucune référence /_next/static dans la page"
  else
    acode=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$url$asset")
    [ "$acode" = "200" ] && ok "statiques servis" || bad "statique $asset → $acode (chemins du build standalone)"
  fi

  # Les NEXT_PUBLIC_* sont inlinées dans les chunks JS : on les parcourt tous.
  chunks=$(printf '%s' "$page" | grep -oE '/_next/static/[^"'"'"' ]+\.js' | sort -u)
  local found_api=0 found_ph=0 c js
  for c in $chunks; do
    js=$(curl -s -m 20 "$url$c")
    [[ "$js" == *"__NEXT_PUBLIC_"* ]] && found_ph=1
    [[ "$js" == *"$(env_value NEXT_PUBLIC_API_URL)"* ]] && found_api=1
  done
  [ "$found_ph" = 0 ] && ok "placeholders substitués" || bad "placeholder __NEXT_PUBLIC_*__ resté dans un chunk (entrypoint)"
  [ "$found_api" = 1 ] && ok "pointe sur $(env_value NEXT_PUBLIC_API_URL)" || bad "l'URL de l'API n'apparaît dans aucun chunk de la page"
}
check_next "Admin" admin "$ADMIN_URL"
check_next "Partenaires" partners "$PARTNERS_URL"

# La landing publique est à la racine du portail partenaires.
code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$(resolve partners "$PARTNERS_URL" 2>/dev/null)/")
[ "$code" = "200" ] && ok "landing partenaires (/) → 200" || bad "landing partenaires (/) → $code"

echo
if [ "$FAILED" -eq 0 ]; then echo -e "${GREEN}════ $ENV : tout est vert ════${NC}"
else echo -e "${RED}════ $ENV : $FAILED contrôle(s) en échec ════${NC}"; exit 1; fi
