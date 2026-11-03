#!/bin/sh
set -e
# Substitution au démarrage des variables publiques de Next.js (repris de Dedalle).
#
# Next remplace process.env.NEXT_PUBLIC_X par sa valeur AU BUILD. L'image inline donc un
# placeholder (__NEXT_PUBLIC_X__, voir next.Dockerfile) et c'est ici qu'il devient la vraie valeur,
# posée sur le conteneur Scaleway — une seule image pour staging et production.
#
# Contrairement à Dedalle, une variable absente est une erreur fatale : sans NEXT_PUBLIC_API_URL,
# le front appellerait une URL vide et chaque écran tomberait en erreur sans rien dire. Mieux
# vaut un conteneur qui refuse de démarrer, visible tout de suite dans la console.

REQUIRED="API_URL"

[ -n "${APP:-}" ] || { echo "entrypoint : variable APP absente (next.Dockerfile)" >&2; exit 1; }
APP_DIR="/app/apps/${APP}"
[ -f "$APP_DIR/server.js" ] || { echo "entrypoint : $APP_DIR/server.js introuvable — image mal assemblée" >&2; exit 1; }

for var in $REQUIRED; do
  name="NEXT_PUBLIC_${var}"
  placeholder="__${name}__"
  eval value=\$$name
  if [ -z "$value" ]; then
    echo "entrypoint : $name absente — à poser sur le conteneur (push-env.sh)" >&2
    exit 1
  fi
  echo "- $name"
  # `|` comme séparateur : les valeurs sont des URL. Bundles serveur et client, HTML prérendu.
  find "$APP_DIR/.next" -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.rsc" -o -name "*.body" \) \
    -exec sed -i "s|${placeholder}|${value}|g" {} +
done

echo "Démarrage de ${APP}…"
exec node "$APP_DIR/server.js"
