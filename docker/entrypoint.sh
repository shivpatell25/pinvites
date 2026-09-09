#!/bin/sh
set -eu

case "${RUN_MIGRATIONS:-true}" in
  true|1|yes)
    pnpm exec prisma migrate deploy
    ;;
  false|0|no)
    ;;
  *)
    echo "RUN_MIGRATIONS must be true or false." >&2
    exit 64
    ;;
esac

exec "$@"
