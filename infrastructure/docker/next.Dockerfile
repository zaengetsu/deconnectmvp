# Fronts Rekonect (Next.js standalone) — une seule recette pour les deux applications :
#   docker build -f infrastructure/docker/next.Dockerfile --build-arg APP=admin .
#   docker build -f infrastructure/docker/next.Dockerfile --build-arg APP=partners .
FROM node:22.13-alpine AS base
RUN npm install -g pnpm@10.28.0
# libc6-compat : souvent requis par Next.js / SWC sur Alpine
RUN apk add --no-cache libc6-compat
WORKDIR /repo
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
ARG APP

FROM base AS pruner
ARG APP
COPY . .
RUN test -n "$APP" || (echo "--build-arg APP=admin|partners manquant" >&2; exit 1)
RUN pnpm dlx turbo@2 prune "@rekonect/${APP}" --docker

FROM base AS builder
ARG APP
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# Next inline les NEXT_PUBLIC_* au build. Pour garder UNE image par front, valable en staging
# comme en production, on inline un placeholder que l'entrypoint remplace au démarrage par la
# valeur posée sur le conteneur. La liste doit rester celle d'entrypoint-next.sh.
ENV NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL__
RUN pnpm turbo run build --filter="@rekonect/${APP}..."

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22.13-alpine AS runtime
ARG APP
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 APP=${APP}
RUN addgroup -S rekonect && adduser -S rekonect -G rekonect
WORKDIR /app
# Dans un monorepo, le serveur standalone vit dans .next/standalone/apps/<app>/server.js et
# cherche ses statiques à côté de lui. Les déposer à la racine de /app donnait, sur Dedalle,
# un site en HTML nu : 404 sur tous les chunks, aucune hydratation.
COPY --from=builder --chown=rekonect:rekonect /repo/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=rekonect:rekonect /repo/apps/${APP}/public ./apps/${APP}/public
COPY --from=builder --chown=rekonect:rekonect /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --chown=rekonect:rekonect infrastructure/docker/entrypoint-next.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER rekonect
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://127.0.0.1:3000/login > /dev/null || exit 1
ENTRYPOINT ["./entrypoint.sh"]
