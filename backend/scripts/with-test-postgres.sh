#!/usr/bin/env bash
#
# Boot a throwaway Postgres, apply every migration to it, and run a command with
# STATS_IT_DATABASE_URL pointing at it. The cluster lives in a temp directory and
# is destroyed on exit — it never touches a real database.
#
# Usage:
#   backend/scripts/with-test-postgres.sh pnpm --filter backend test:integration
#
# Exists because the /stats route tests mock db.execute wholesale and assert on
# the rendered SQL string, so no query is ever planned. That is how a query that
# failed on EVERY call against a real Postgres ("operator is not unique:
# date + unknown") shipped with a green suite.
set -euo pipefail

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  if command -v initdb >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v initdb)")"
  else
    echo "with-test-postgres: no Postgres server binaries found (looked in /usr/lib/postgresql/*/bin and PATH)." >&2
    echo "Install postgresql, or set PGBIN to the directory containing initdb." >&2
    exit 127
  fi
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/reprounds-pgtest.XXXXXX")"
PORT="${PGTEST_PORT:-54329}"
DBNAME=reprounds_test

# initdb refuses to run as root, so a root shell (containers, CI images) drops to
# the postgres system user for the server's own processes.
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  if id -u postgres >/dev/null 2>&1; then
    RUNAS="postgres"
    chown -R postgres "$WORKDIR"
  else
    echo "with-test-postgres: running as root and no 'postgres' user exists to drop to." >&2
    exit 1
  fi
fi

run_pg() {
  if [ -n "$RUNAS" ]; then su "$RUNAS" -c "$*"; else eval "$*"; fi
}

cleanup() {
  run_pg "$PGBIN/pg_ctl -D $WORKDIR/data stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "with-test-postgres: initialising cluster in $WORKDIR"
run_pg "$PGBIN/initdb -D $WORKDIR/data -U postgres --auth=trust" >/dev/null

# TCP, not a unix socket: postgres-js does not honour the ?host=/path form of the
# connection string, so a socket-only cluster is unreachable from the app code.
run_pg "$PGBIN/pg_ctl -D $WORKDIR/data -o '-h 127.0.0.1 -p $PORT -k $WORKDIR' -l $WORKDIR/server.log start" >/dev/null
run_pg "$PGBIN/createdb -h 127.0.0.1 -p $PORT -U postgres $DBNAME"

export STATS_IT_DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/$DBNAME"

echo "with-test-postgres: applying migrations"
psql "$STATS_IT_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
  -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto' >/dev/null
# In _journal.json order — Drizzle migrations are not idempotent and several
# depend on the shape left by the one before.
#
# Read into an array first rather than piping into `while read`: psql inherits
# the loop's stdin and swallows the remaining tags, so a pipeline silently
# applies only the first migration and every later table is missing.
mapfile -t MIGRATIONS < <(node -e '
  const j = require("'"$REPO_ROOT"'/backend/src/db/migrations/meta/_journal.json");
  process.stdout.write(j.entries.map((e) => e.tag).join("\n"));
')
echo "with-test-postgres: ${#MIGRATIONS[@]} migrations"
for tag in "${MIGRATIONS[@]}"; do
  psql "$STATS_IT_DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -f "$REPO_ROOT/backend/src/db/migrations/$tag.sql" >/dev/null </dev/null
done

echo "with-test-postgres: running $*"
"$@"
