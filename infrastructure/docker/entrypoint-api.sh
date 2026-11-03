#!/bin/sh
set -e
# Même image, deux processus (docs/architecture.md §1) :
#   api    → dist/main.js   : HTTP REST /v1 + WebSocket /realtime, sans état, N instances
#   worker → dist/worker.js : outbox, notifications, emails, crons ; sonde sur WORKER_HTTP_PORT
case "${REKONECT_PROCESS:-api}" in
  api)    exec node dist/main.js ;;
  worker) exec node dist/worker.js ;;
  *) echo "REKONECT_PROCESS inconnu : « $REKONECT_PROCESS » (api | worker)" >&2; exit 1 ;;
esac
