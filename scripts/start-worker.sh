#!/usr/bin/env sh
set -eu

echo "Starting Boteco12 BullMQ worker..."

exec node dist/worker.js
