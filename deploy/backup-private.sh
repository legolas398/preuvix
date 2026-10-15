#!/bin/sh
# Run as root on the Linux deployment host. The repository path is fixed by this file.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
mkdir -p private-runtime/status
exec 9>private-runtime/backup.lock
flock -n 9 || { echo 'A backup is already running.' >&2; exit 1; }
test -r /etc/preuvix/restic.env
set -a
. /etc/preuvix/restic.env
set +a
: "${RESTIC_REPOSITORY:?Configure the off-server repository}"
: "${RESTIC_PASSWORD_FILE:?Configure its password file}"
command -v restic >/dev/null
restic snapshots >/dev/null
compose() { docker compose --env-file .env.production -f deploy/compose.private.yaml "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
snapshot="private-runtime/snapshots/$stamp"
# Stop writers during the short snapshot to keep auxiliary files and DB together.
trap 'compose start preuvix' EXIT
compose stop preuvix
compose run --rm --no-deps snapshot create /source "/snapshots/$stamp"
compose start preuvix
trap - EXIT
restic backup "$snapshot" .env.production trust deploy --tag preuvix-private
restic check
printf '{"completedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > private-runtime/status/backup-success.json.tmp
mv private-runtime/status/backup-success.json.tmp private-runtime/status/backup-success.json
echo "Snapshot verified and uploaded: $stamp"
# Local plaintext snapshots are intentionally not deleted automatically.
# Apply retention only after a successful isolated restore drill (see the runbook).
