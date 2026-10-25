#!/bin/sh
set -eu
# Root-owned host receipts bind the current boot's verified loop devices. The host
# service resolves UUID/backing inode on every boot; loop numbers are not durable IDs.
identities=$1
registry=$2
journal=$3
shift 3
verify_mount() {
  name=$1
  path=$2
  read -r device maximum uuid fsid < "$identities/$name.receipt"
  test -n "$uuid"
  # Proof: a wrong ext4 filesystem on the reused loop device is refused by the physical rehearsal.
  actual_fsid=$(stat -f -c '%i' "$path")
  test "$actual_fsid" = "$fsid"
  # Proof: directory fallback and wrong ext4 device fail in registry-storage-rehearsal.sh.
  awk -v path="$path" -v device="$device" '
    $5 == path { count++; if ($3 != device) next; for (i = 7; i <= NF; i++) if ($i == "-" && $(i+1) == "ext4") found = 1 }
    END { exit !(count == 1 && found) }
  ' /proc/self/mountinfo
  measurement=$(stat -f -c '%S %b' "$path")
  read -r block_size block_count <<MEASUREMENT
$measurement
MEASUREMENT
  test "$(( block_size * block_count ))" -gt 0
  # Proof: removing this bound admits the oversized filesystem in the physical rehearsal.
  test "$(( block_size * block_count ))" -le "$maximum"
}
verify_mount registry "$registry"
verify_mount journal "$journal"
# The durable journal fence is checked here by the pressure/admission slice before exec.
exec "$@"
