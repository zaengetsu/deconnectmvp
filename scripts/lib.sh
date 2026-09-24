#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Rekonect — fonctions communes aux scripts de livraison
# (fichier sourcé, pas exécuté)
# ──────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
API_DIR="$ROOT_DIR/apps/api"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok()   { printf '  ✅ %s\n' "$1"; }
info() { printf '  ℹ️  %s\n' "$1"; }
warn() { printf '  ⚠️  %s\n' "$1" >&2; }
fail() { printf '\n❌ %s\n' "$1" >&2; exit 1; }

# Secrets de livraison (clé App Store Connect, Firebase…) : jamais dans le dépôt.
# Chargés depuis ~/.rekonect/release.env puis <racine>/.release.env (gitignoré).
load_release_env() {
  for f in "$HOME/.rekonect/release.env" "$ROOT_DIR/.release.env"; do
    if [ -f "$f" ]; then
      set -a
      # shellcheck disable=SC1090
      . "$f"
      set +a
      info "Réglages chargés depuis ${f/#$HOME/~}"
    fi
  done
}

use_node() {
  if [ -s "$HOME/.nvm/nvm.sh" ] && [ -f "$ROOT_DIR/.nvmrc" ]; then
    # nvm n'est pas compatible avec « set -eu » (variables non définies, codes de retour 3 quand
    # une version manque) : on le charge avec ces options coupées, puis on les rétablit.
    # Pas de sous-shell : « nvm use » doit changer le Node du script lui-même.
    local flags="$-" pf=0
    shopt -qo pipefail && pf=1
    set +euo pipefail
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh" --no-use >/dev/null 2>&1
    local here="$PWD"
    cd "$ROOT_DIR" && { nvm use >/dev/null 2>&1 || nvm install >/dev/null 2>&1; }
    cd "$here"
    [[ "$flags" == *e* ]] && set -e
    [[ "$flags" == *u* ]] && set -u
    [ "$pf" = 1 ] && set -o pipefail
    true
  fi
  command -v node >/dev/null 2>&1 || fail "Node.js introuvable (Node 22.12+ requis)."
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' \
    || fail "Node 22.12+ requis (trouvé : $(node --version)). nvm install 22"
  if ! command -v pnpm >/dev/null 2>&1; then
    info "pnpm absent : activation via corepack"
    corepack enable >/dev/null 2>&1 || npm i -g pnpm@10 >/dev/null 2>&1 || fail "Impossible d'installer pnpm (npm i -g pnpm@10)."
  fi
}

# Lit une variable dans un fichier .env (sans l'exécuter).
env_value() {
  [ -f "$2" ] || return 0
  grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# Variables Vite de l'app mobile pour un build de production.
# Vite lit apps/mobile/.env, .env.production, .env.production.local (le .env de la racine n'est PAS lu).
mobile_env() {
  local v
  for f in .env .env.local .env.production .env.production.local; do
    v="$(env_value "$1" "$MOBILE_DIR/$f")"
    [ -n "$v" ] && MOBILE_ENV_VALUE="$v"
  done
  # Une variable exportée dans le shell l'emporte, comme pour Vite.
  [ -n "${!1:-}" ] && MOBILE_ENV_VALUE="${!1}"
  printf '%s' "${MOBILE_ENV_VALUE:-}"
  MOBILE_ENV_VALUE=""
}

# Vérifie que le build mobile pointera vers les bons serveurs.
check_mobile_env() {
  local target="$MOBILE_DIR/.env.production.local"
  # Ancienne organisation : les clés VITE_* vivaient dans le .env de la racine.
  if [ -z "$(mobile_env VITE_API_URL)" ] && [ -n "$(env_value VITE_API_URL "$ROOT_DIR/.env")" ]; then
    grep -E '^VITE_API_URL' "$ROOT_DIR/.env" >> "$target"
    warn "VITE_API_URL recopiée du .env racine vers apps/mobile/.env.production.local (Vite ne lit pas le .env racine)."
  fi
  local api
  api="$(mobile_env VITE_API_URL)"
  # L'app ne parle plus qu'à l'API Rekonect : plus de clé Supabase dans le build mobile.
  if [ -z "$api" ]; then
    fail "VITE_API_URL manquant : l'app ne saurait pas joindre l'API Rekonect (seul serveur de l'app).
   Ajoutez VITE_API_URL=https://api.votre-domaine dans apps/mobile/.env.production.local"
  fi
  case "$api" in
    *localhost*|*127.0.0.1*|*192.168.*|http://*)
      if [ "${ALLOW_LOCAL_API:-0}" != 1 ]; then
        fail "VITE_API_URL=$api n'est pas joignable depuis le téléphone d'un testeur (adresse locale ou non HTTPS).
   Mettez l'URL publique de l'API, ou relancez avec --allow-local-api pour un test sur votre réseau."
      fi
      warn "API locale ($api) : seuls les appareils de votre réseau pourront l'utiliser." ;;
  esac
  ok "API : $api"
}

# Numéro de build : App Store Connect et Firebase refusent deux livraisons au même numéro.
bump_build() {
  local file="$MOBILE_DIR/version.json"
  [ -f "$file" ] || fail "apps/mobile/version.json introuvable."
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    const v = JSON.parse(fs.readFileSync(f, "utf8"));
    const min = Number(process.argv[2] || 0);
    v.build = Math.max(Number(v.build || 0) + 1, min);
    fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
  ' "$file" "${MIN_BUILD:-0}"
  ok "Version $(node -p "require('$file').version") — build $(node -p "require('$file').build")"
}

current_version() { node -p "const v=require('$MOBILE_DIR/version.json'); v.version+' ('+v.build+')'"; }

commit_version() {
  if [ "${COMMIT_VERSION:-0}" = 1 ]; then
    git -C "$ROOT_DIR" add apps/mobile/version.json
    git -C "$ROOT_DIR" commit -q -m "chore(mobile): build $(node -p "require('$MOBILE_DIR/version.json').build")" apps/mobile/version.json \
      && ok "version.json commité"
  else
    info "Pensez à commiter apps/mobile/version.json (ou relancez avec --commit)."
  fi
}

# Notes de version : --notes, sinon les derniers commits.
release_notes() {
  if [ -n "${NOTES:-}" ]; then printf '%s' "$NOTES"; return; fi
  printf 'Rekonect %s — %s\n' "$(current_version)" "$(date '+%d/%m/%Y %H:%M')"
  git -C "$ROOT_DIR" log -8 --pretty='- %s' 2>/dev/null | cut -c1-110
}

# Garde-fou : on livre ce qui est commité, sinon on le dit clairement.
check_git_state() {
  # version.json change à chaque livraison : il ne bloque pas.
  if ! git -C "$ROOT_DIR" diff --quiet HEAD -- . ':(exclude)apps/mobile/version.json' 2>/dev/null; then
    if [ "${ALLOW_DIRTY:-0}" = 1 ]; then
      warn "Des modifications ne sont pas commitées : elles seront incluses dans ce build."
    else
      fail "Des modifications ne sont pas commitées ($(git -C "$ROOT_DIR" diff --name-only HEAD | wc -l | tr -d ' ') fichiers).
   Commitez-les, ou relancez avec --allow-dirty pour livrer l'état actuel du dossier."
    fi
  fi
  ok "Branche $(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD) @ $(git -C "$ROOT_DIR" rev-parse --short HEAD)"
}
