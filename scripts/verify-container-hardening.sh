#!/usr/bin/env sh
set -eu

IMAGE="${1:?usage: verify-container-hardening.sh <image>}"

docker run --rm --entrypoint sh "$IMAGE" -c '
  set -eu
  test "$(id -u)" -ne 0
  test "$(node -p "process.versions.node.split(\".\")[0]")" = "22"
  test "$NODE_ENV" = "production"
  test -f dist/index.js
  test -f dist/worker.js
  test -f scripts/start-production.sh
  test -f prisma.config.ts
  test -f prisma/schema.prisma
  test -x node_modules/.bin/prisma
  test ! -e /usr/local/bin/npm
  test ! -e /usr/local/bin/npx
  # Prisma 7 loads prisma.config.ts through its own TypeScript dependency.
  test -d node_modules/typescript
  test ! -d node_modules/ts-node-dev
  test ! -d node_modules/pino-pretty
  pg_dump --version | grep -q " 16\."
  pg_restore --version | grep -q " 16\."
  node -e "require(\"@prisma/client\"); require(\"prisma/package.json\")"
  DATABASE_URL=postgresql://verify:verify@localhost:5432/verify \
    ./node_modules/.bin/prisma version >/dev/null
'

HEALTHCHECK="$(docker inspect --format '{{json .Config.Healthcheck.Test}}' "$IMAGE")"
case "$HEALTHCHECK" in
  *'/health'*) ;;
  *)
    echo "Container healthcheck does not target /health" >&2
    exit 1
    ;;
esac

echo "Container hardening verification passed for $IMAGE"
