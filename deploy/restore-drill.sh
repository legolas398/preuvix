#!/bin/sh
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
snapshot_id=${1:?Pass the exact restic snapshot ID to restore}
case "$snapshot_id" in *[!a-f0-9]*|'') echo 'Invalid snapshot ID' >&2; exit 1;; esac
test "${#snapshot_id}" -ge 8
test "${#snapshot_id}" -le 64
test -r /etc/preuvix/restic.env
set -a
. /etc/preuvix/restic.env
set +a
: "${RESTIC_REPOSITORY:?Configure the off-server repository}"
: "${RESTIC_PASSWORD_FILE:?Configure its password file}"
mkdir -p private-runtime/restore-drills private-runtime/status
run="$root/private-runtime/restore-drills/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$run"
restic restore "$snapshot_id" --target "$run/download"
# Only the new drill directory is mounted. Production data is never a restore target.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 0:0 -v "$run:/drill" preuvix-private:local node scripts/restore-drill.mjs /drill/download /drill/restored
printf '{"completedAt":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > private-runtime/status/restore-success.json.tmp
mv private-runtime/status/restore-success.json.tmp private-runtime/status/restore-success.json
echo 'Isolated restoration and proof verification succeeded. Plaintext drill files were retained locally.'
