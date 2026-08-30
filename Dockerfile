FROM postgres:16-alpine AS postgres-client

############################
# STAGE 1 — BUILD
############################
FROM node:22-alpine AS build

WORKDIR /app

RUN apk add --no-cache ca-certificates openssl

COPY package*.json ./
RUN npm ci

COPY . .

# Identifica exatamente os insumos servidos pelo endpoint /health.
RUN node scripts/release-fingerprint.js > .release-version

RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
RUN npm run build

# Prisma CLI permanece como dependência operacional; compiladores, tipos,
# ts-node e demais dependências de desenvolvimento são removidos.
RUN npm prune --omit=dev && npm cache clean --force


############################
# STAGE 2 — RUNTIME
############################
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache ca-certificates curl krb5-libs openldap openssl postgresql-client \
  && mkdir -p /app/backups \
  && chown -R node:node /app \
  && rm -rf \
    /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx

# Keep backup/restore tooling on the same major as the PostgreSQL server.
# Newer pg_dump versions may emit settings unsupported by PostgreSQL 16.
COPY --from=postgres-client /usr/local/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-client /usr/local/bin/pg_restore /usr/local/bin/pg_restore
COPY --from=postgres-client /usr/local/lib/libpq.so.5.16 /usr/local/lib/libpq.so.5.16
RUN ln -sf libpq.so.5.16 /usr/local/lib/libpq.so.5

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/.release-version ./.release-version

USER node

EXPOSE 3001
EXPOSE 3002

# Default HEALTHCHECK targets the API. Worker containers may override PORT
# with WORKER_HEALTH_PORT (default 3002).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3001}/health" >/dev/null || exit 1

CMD ["sh", "./scripts/start-production.sh"]
