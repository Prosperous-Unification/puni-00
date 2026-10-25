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
  # stat does not follow symlinks: 81a4 is a regular mode-0644 file; require root
  # UID/GID and one link before reading claims, even when receipt bytes are unchanged.
  # Proof: identical-byte metadata drift fails the physical rehearsal; removal admits it.
  receipt_metadata=$(stat -c '%f:%u:%g:%h' "$identities/$name.receipt")
  test "$receipt_metadata" = '81a4:0:0:1'
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
# The authority alone publishes a thirty-second derived permit. Unknown state runs
# read-only; it cannot bootstrap writable service after a checker or host restart.
permits_writes() {
  permission="$journal/contents/writable.permit"
  canonical="$journal/contents/journal.json"
  metadata=$(stat -c '%f:%u:%g:%h' "$permission" 2>/dev/null) || return 1
  test "$metadata" = '8180:59001:59001:1' || return 1
  metadata=$(stat -c '%f:%u:%g:%h' "$canonical" 2>/dev/null) || return 1
  test "$metadata" = '8180:59001:59001:1' || return 1
  size=$(stat -c '%s' "$permission") || return 1
  test "$size" -le 256 || return 1
  read -r version boot issued expires first second extra < "$permission" || return 1
  test -z "$extra" || return 1
  actual_boot=$(cat /proc/sys/kernel/random/boot_id) || return 1
  test "$boot" = "$actual_boot" || return 1
  uptime=$(cut -d ' ' -f 1 /proc/uptime) || return 1
  # Proof: removing expiry admits an actual upload after the real thirty-second checker-death fence.
  printf '%s %s %s %s %s %s\n' "$version" "$issued" "$expires" "$first" "$second" "$uptime" |
    awk 'NF == 6 && $1 == 1 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ &&
      length($4) == 64 && $4 !~ /[^0-9a-f]/ && length($5) == 64 && $5 !~ /[^0-9a-f]/ &&
      $2 <= $6 && $3 > $6 && $3 - $2 == 30 { valid = 1 } END { exit !valid }' || return 1
  checksum=$(sha256sum "$canonical") || return 1
  checksum=${checksum%% *}
  test "$checksum" = "$first" || test "$checksum" = "$second"
}
umask 077
instance=$(cat /proc/sys/kernel/random/uuid)
instance_boot=$(cat /proc/sys/kernel/random/boot_id)
printf '%s %s\n' "$instance" "$instance_boot" > "$registry/.authority-instance"
child=
stop_child() {
  if test -n "$child" && kill -0 "$child" 2>/dev/null; then
    kill -KILL "$child"
    if wait "$child"; then :; else test "$?" -eq 137; fi
  fi
  child=
}
trap 'stop_child; exit 0' TERM INT HUP
mode=
while :; do
  desired="readonly"
  # Proof: removing this guard admits uploads without permission in registry-capacity-rehearsal.test.sh.
  if permits_writes; then desired=writable; fi
  if test "$desired" != "$mode"; then
    stop_child
    mode=$desired
    if test "$mode" = readonly; then
      REGISTRY_STORAGE_MAINTENANCE_READONLY='{"enabled":true}'  "$@" &
    else
      REGISTRY_STORAGE_MAINTENANCE_READONLY='{"enabled":false}'  "$@" &
    fi
    child=$!
  fi
  if test "$mode" = readonly && test -f "$journal/contents/readonly.request"; then
    read -r nonce expected_instance expected_boot extra < "$journal/contents/readonly.request"
    if test -z "$extra" && test "$expected_instance" = "$instance" && test "$expected_boot" = "$instance_boot"; then
      printf '%s %s %s\n' "$nonce" "$instance" "$instance_boot" > "$registry/.authority-readonly"
    fi
  fi
  sleep 1
  if ! kill -0 "$child" 2>/dev/null; then
    if wait "$child"; then exit 0; else exit "$?"; fi
  fi
done
