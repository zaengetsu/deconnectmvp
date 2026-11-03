#!/bin/bash
# ══════════════════════════════════════════════════════════════
# db-status.sh — la base est-elle à jour avec le code ?
#
#   ./infrastructure/scaleway/db-status.sh production
#   ./infrastructure/scaleway/db-status.sh production --resolve-baseline   # une seule fois, ancienne base Supabase
#
# Trois réponses, une seule veut dire « tout va bien » :
#   0 — à jour      1 — migrations à jouer (nommées)      2 — base injoignable : on ne sait rien
# ══════════════════════════════════════════════════════════════
set -uo pipefail
source "$(dirname "$0")/lib.sh"
select_env "${1:-}"
require_tools pnpm
require_env_file

echo -e "\n${BLUE}━━━ Base · $ENV ━━━${NC}"
DB_URL=$(env_value DIRECT_URL); DB_URL=${DB_URL:-$(env_value DATABASE_URL)}
DATABASE_URL=$(env_value DATABASE_URL); export DATABASE_URL DIRECT_URL="$DB_URL"

# Ancienne base Supabase dont le schéma existe déjà : la marquer une fois comme à jour de la baseline.
if [ "${2:-}" = "--resolve-baseline" ]; then
  pnpm --filter @rekonect/api prisma:resolve-baseline 2>&1 | sed -E 's#postgres(ql)?://[^ ]+#<url masquée>#g'
fi

OUT=$(pnpm --filter @rekonect/api exec prisma migrate status 2>&1)
# Le mot de passe voyage dans l'URL : il ne doit jamais atterrir dans un terminal partagé.
echo "$OUT" | sed -E 's#postgres(ql)?://[^ ]+#<url masquée>#g' | grep -vE '^\s*$' | tail -n 15

if echo "$OUT" | grep -qE "P1001|P1002|P1017|Can't reach database server|Timed out"; then
  ko "base injoignable — état des migrations inconnu"
  echo -e "    Réseau ou VPN du poste, projet Supabase en pause, ou IP hors liste autorisée"
  echo -e "    (Supabase › Settings › Database › Network restrictions)."
  exit 2
fi
if echo "$OUT" | grep -qi "Database schema is up to date"; then
  ok "la base est à jour avec le code"
  exit 0
fi
if echo "$OUT" | grep -q "P3005"; then
  warn "ancienne base Supabase jamais marquée : une seule fois,"
  echo -e "    ${BLUE}./infrastructure/scaleway/db-status.sh $ENV --resolve-baseline${NC}"
  exit 1
fi
warn "migrations à jouer : ${BLUE}./infrastructure/scaleway/deploy-local.sh $ENV api${NC} (les joue avant l'image)"
exit 1
