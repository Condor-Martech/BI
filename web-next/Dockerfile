# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app


FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-workspace


FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time: los NEXT_PUBLIC_* se inlinean en el bundle del cliente y el plugin
# de Sentry sube sourcemaps durante el build. Sin esto quedan undefined en la imagen.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_OPENPANEL_CLIENT_ID
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_OPENPANEL_CLIENT_ID=$NEXT_PUBLIC_OPENPANEL_CLIENT_ID \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT

# SENTRY_AUTH_TOKEN es secreto -> mount, no ARG (no queda en el image history).
# Sin el secreto el build sigue; el plugin solo se saltea el upload de sourcemaps.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    pnpm build


FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache tini && \
    addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

USER nextjs
EXPOSE 3002

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
