#!/usr/bin/env bash
# Sincroniza el entorno de dev local tras un pull: dependencias,
# cliente de Prisma, migraciones pendientes, seed idempotente y suite.
# Un solo comando: bash scripts/sync-dev.sh   (desde medicfy-backend/)
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
pnpm test
echo
echo "✔ Entorno de dev sincronizado y suite en verde."
