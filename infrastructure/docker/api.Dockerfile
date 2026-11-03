# API Rekonect — image de production (NestJS, Prisma 7 sans moteur natif).
# Une seule image pour deux processus : REKONECT_PROCESS=api (HTTP + WebSocket) ou worker.
# Build multi-étapes : workspace élagué (turbo prune) → build → runtime minimal, non-root.
FROM node:22.13-alpine AS base
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=1

# ── uniquement le sous-graphe de l'API ───────────────────────────────────────
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2 prune @rekonect/api --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
# Lockfile et pnpm-workspace.yaml d'origine (comme Dedalle) : ce dernier porte
# onlyBuiltDependencies, sans quoi Prisma et Nest n'exécutent pas leurs scripts d'installation.
COPY --from=pruner /repo/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# Client Prisma (src/generated, ignoré par git et par .dockerignore), puis contracts (tsup) et l'API.
RUN pnpm --filter @rekonect/api exec prisma generate
RUN pnpm turbo run build --filter=@rekonect/api...
# Dépendances de production seules ; les paquets du workspace sont recopiés, pas liés.
RUN pnpm --filter @rekonect/api --prod deploy --legacy /out/api

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22.13-alpine AS runtime
ENV NODE_ENV=production PORT=3000
RUN addgroup -S rekonect && adduser -S rekonect -G rekonect
WORKDIR /app
COPY --from=builder --chown=rekonect:rekonect /out/api/ ./
# dist est ignoré par git, donc absent de ce que recopie `pnpm deploy` : on le pose explicitement
# (il contient aussi le client Prisma généré, compilé depuis src/generated).
COPY --from=builder --chown=rekonect:rekonect /repo/apps/api/dist ./dist
COPY --chown=rekonect:rekonect infrastructure/docker/entrypoint-api.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER rekonect
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${WORKER_HTTP_PORT:-$PORT}/health" > /dev/null || exit 1
ENTRYPOINT ["./entrypoint.sh"]
