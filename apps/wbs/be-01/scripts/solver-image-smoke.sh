#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Proof: the fake-Docker production entrypoint test observed the old three-level ascent passing
# `<workspace>/apps/apps/wbs/be-01/Dockerfile` and `<workspace>/apps` as its build inputs.
repo_root="$(cd "$script_dir/../../../.." && pwd)"
supplied_image=''
client_pull=()
if [ "$#" -ne 0 ]; then
  # Proof: accepting a tag made the tag refusal negative observe Docker calls before refusal.
  if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^--image=([a-z0-9]+([.-][a-z0-9]+)*(:[0-9]+)?/)([a-z0-9]+([._-][a-z0-9]+)*/)*[a-z0-9]+([._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$ ]]; then
    echo '[solver-image-smoke] expected no arguments or --image=REGISTRY/BE@sha256:<64 lowercase hex>' >&2
    exit 1
  fi
  supplied_image="${1#--image=}"
  registry_host="${supplied_image%%/*}"
  # Proof: removing this guard let library/backend, team/nested/backend and registry/backend
  # reach Docker; all three production-entrypoint namespace refusal tests failed.
  if [[ "$registry_host" != localhost && "$registry_host" != *.* && "$registry_host" != *:* ]]; then
    echo '[solver-image-smoke] supplied image requires an explicit registry host (dotted host, localhost or host:port)' >&2
    exit 1
  fi
  client_pull=(--pull=never)
  # Proof: before this guard, the orphan-flag refusal test reached Docker and failed.
  if [ "${WBS_RUN_SOLVER_ORPHAN_PROC:-0}" != '0' ]; then
    echo '[solver-image-smoke] supplied image mode refuses WBS_RUN_SOLVER_ORPHAN_PROC; it cannot build a derivative image' >&2
    exit 1
  fi
fi

attempt_token="$(cat /proc/sys/kernel/random/uuid)"
attempt_tokens=("$attempt_token")
# Every tag is unique to this attempt so cleanup removes only what this attempt created.
image="wbs-be-01:solver-smoke-$attempt_token"
request="$repo_root/libs/wbs/domain/contracts/solver/fixtures/request/valid-quantised-baseline.json"
registry_name="wbs-solver-smoke-registry-$$"
caller_name="wbs-solver-smoke-caller-$$"
if [ -n "$supplied_image" ]; then caller_name="wbs-solver-smoke-caller-$attempt_token"; fi
socket_directory=''
socket_path=''
supervisor_pid=''
composed_inventory=''
created_images=()

# Returns 0 when image $1 exists, 1 when Docker reports it absent and 2 when Docker cannot
# answer, so a broken daemon cannot pass for a removed image.
probe_image() {
  local inspect_error
  if inspect_error="$(docker image inspect "$1" 2>&1 >/dev/null)"; then
    return 0
  fi
  case "$inspect_error" in
    *'No such image'*) return 1 ;;
  esac
  echo "[solver-image-smoke] cannot inspect image $1: $inspect_error" >&2
  return 2
}

# Removes only an invocation-owned container and proves absence; a daemon/permission error
# cannot stand in for a missing container or successful cleanup.
remove_owned_container() {
  local name="$1" inspect_error
  if inspect_error="$(docker container inspect "$name" 2>&1 >/dev/null)"; then
    # Proof: injected rm refusal makes the caller-rm-fails and container-rm-fails negatives fail acceptance.
    if ! docker rm --force "$name" >/dev/null; then
      echo "[solver-image-smoke] could not remove container $name" >&2
      return 1
    fi
  else
    case "$inspect_error" in
      *'No such container'*) return 0 ;;
      # Proof: treating permission refusal as absence made inspect-container-broken exit 0.
      *) echo "[solver-image-smoke] cannot inspect container $name: $inspect_error" >&2; return 1 ;;
    esac
  fi
  # Proof: removing this readback let container-rm-ignored report successful cleanup.
  if inspect_error="$(docker container inspect "$name" 2>&1 >/dev/null)"; then
    echo "[solver-image-smoke] container outlived the smoke: $name" >&2
    return 1
  fi
  case "$inspect_error" in
    *'No such container'*) return 0 ;;
    *) echo "[solver-image-smoke] cannot inspect container $name: $inspect_error" >&2; return 1 ;;
  esac
}

# Removes every image this attempt tagged, newest first, and fails if any removal failed, any
# tag survived or Docker could not say. Docker can drop a tag and then fail to delete the
# image, so a failed `image rm` counts even when the tag is gone. An image whose presence is
# unknown is still removed, so one bad inspect does not strand the rest.
remove_created_images() {
  local index reference presence
  local removal_failed=0
  local surviving=()
  for ((index = ${#created_images[@]} - 1; index >= 0; index--)); do
    reference="${created_images[index]}"
    presence=0
    probe_image "$reference" || presence=$?
    # Proof: with an inspect failure ending cleanup, solver-image-smoke.test.ts saw one bad
    # orphan inspect leave all three tags in the fake Docker store.
    if [ "$presence" -eq 1 ]; then
      continue
    fi
    # Proof: without this, solver-image-smoke.test.ts saw a smoke whose first orphan inspect
    # failed and whose later inspects succeeded exit 0.
    if [ "$presence" -eq 2 ]; then
      removal_failed=1
    fi
    if ! docker image rm "$reference" >/dev/null; then
      echo "[solver-image-smoke] could not remove image $reference" >&2
      # Proof: without this, solver-image-smoke.test.ts saw a smoke whose image delete failed
      # after untagging exit 0.
      removal_failed=1
    fi
  done
  for reference in "${created_images[@]}"; do
    presence=0
    probe_image "$reference" || presence=$?
    case "$presence" in
      0) surviving+=("$reference") ;;
      # Proof: treating an inspect failure as absence let the broken-inspect smoke exit 0.
      2) removal_failed=1 ;;
    esac
  done
  if [ "${#surviving[@]}" -ne 0 ]; then
    echo "[solver-image-smoke] images outlived the smoke: ${surviving[*]}" >&2
    return 1
  fi
  return "$removal_failed"
}

# Collect only UUID tokens recorded before the composed client's real host requests.
# Partial failures still release every recorded child; a successful run requires both objectives.
collect_composed_attempts() {
  local status="$1" token inventory_bytes count=0 invalid=0
  local seen=' '
  # Proof: removing read-failure refusal lost the missing/unreadable diagnoses in four negatives.
  if ! inventory_bytes="$(cat "$composed_inventory")"; then
    echo '[solver-image-smoke] composed attempt inventory is unreadable' >&2
    return 1
  fi
  if [ -n "$inventory_bytes" ]; then
    while IFS= read -r token || [ -n "$token" ]; do
      # Proof: bypassing UUID/uniqueness validation failed four malformed/duplicate negatives.
      if [[ ! "$token" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || [[ "$seen" == *" $token "* ]]; then
        echo '[solver-image-smoke] composed attempt inventory is malformed or duplicated' >&2
        invalid=1
        continue
      fi
      seen+="$token "
      attempt_tokens+=("$token")
      count=$((count + 1))
    done <<< "$inventory_bytes"
  fi
  # Proof: removing the count guard let incomplete/overflow inventories pass in both modes.
  if [ "$count" -gt 2 ] || { [ "$status" -eq 0 ] && [ "$count" -ne 2 ]; }; then
    echo '[solver-image-smoke] composed attempt inventory must contain Pri and Time exactly once' >&2
    invalid=1
  fi
  return "$invalid"
}

# Runs every cleanup step even when one fails, and turns a passing smoke into a failure when
# any step failed, so a leaked container or image never hides behind the original status.
cleanup() {
  local status=$?
  local cleanup_failed=0
  local token
  if ! collect_composed_attempts "$status"; then cleanup_failed=1; fi
  # Proof: ignoring removal failure lost the required diagnosis in both inventory-rm-fails cases.
  if ! rm "$composed_inventory"; then
    echo '[solver-image-smoke] could not remove composed attempt inventory' >&2
    cleanup_failed=1
  fi
  if [ -n "$supervisor_pid" ]; then
    if [ -n "$supplied_image" ]; then
      if kill -0 "$supervisor_pid" 2>/dev/null && ! kill "$supervisor_pid"; then
        echo '[solver-image-smoke] could not stop temporary supervisor' >&2
        cleanup_failed=1
      fi
      # Proof: ignoring wait failure made supervisor-stop-fails exit 0.
      if ! wait "$supervisor_pid"; then
        echo '[solver-image-smoke] temporary supervisor failed during cleanup' >&2
        cleanup_failed=1
      fi
    else
      kill "$supervisor_pid" 2>/dev/null || true
      wait "$supervisor_pid" 2>/dev/null || true
    fi
  fi
  if [ -n "$supplied_image" ]; then
    # Proof: adding removal of an unrelated container failed the owned-resource inventory test.
    if ! remove_owned_container "$caller_name"; then cleanup_failed=1; fi
    for token in "${attempt_tokens[@]}"; do
      if ! remove_owned_container "wbs-solver-$token"; then cleanup_failed=1; fi
    done
    # Proof: ignoring rmdir refusal made socket-rmdir-fails exit 0.
    if ! rmdir "$socket_directory"; then cleanup_failed=1; fi
    # Proof: dropping cleanup status propagation made the container refusal tests exit 0.
    # Proof: adding supplied-image removal here failed the artifact preservation test.
    if [ "$status" -eq 0 ] && [ "$cleanup_failed" -ne 0 ]; then status=1; fi
    exit "$status"
  fi
  docker stop "$registry_name" >/dev/null 2>&1 || true
  # Proof: with this removal failing under `set -e`, solver-image-smoke.test.ts observed the
  # trap exit before any image removal and all three tags left in the fake Docker store.
  if ! remove_owned_container "$caller_name"; then cleanup_failed=1; fi
  for token in "${attempt_tokens[@]}"; do
    if ! remove_owned_container "wbs-solver-$token"; then cleanup_failed=1; fi
  done
  if ! rmdir "$socket_directory"; then cleanup_failed=1; fi
  # Proof: with this call removed, or run only after a passing smoke, solver-image-smoke.test.ts
  # observed the build and registry tags left in the fake Docker store.
  if ! remove_created_images; then
    cleanup_failed=1
  fi
  if [ "$status" -eq 0 ] && [ "$cleanup_failed" -ne 0 ]; then
    status=1
  fi
  exit "$status"
}
# Proof: skipping this probe let the missing-digest negative reach the clients; treating a
# daemon refusal as absence lost the distinct inspect-failure diagnosis.
if [ -n "$supplied_image" ]; then
  presence=0
  probe_image "$supplied_image" || presence=$?
  case "$presence" in
    0) ;;
    1) echo "[solver-image-smoke] supplied image is not locally available: $supplied_image" >&2; exit 1 ;;
    2) exit 1 ;;
  esac
fi
socket_directory="$(mktemp -d "/run/user/$(id -u)/wbs-solver-smoke.XXXXXX")"
socket_path="$socket_directory/supervisor.sock"
composed_inventory="$socket_directory/composed-attempts"
: > "$composed_inventory"
trap cleanup EXIT

if [ -n "$supplied_image" ]; then
  # Proof: substituting a different digest failed the exact-digest host/client assertions.
  solver_image="$supplied_image"
else
  created_images+=("$image")
  docker build --file "$repo_root/apps/wbs/be-01/Dockerfile" --tag "$image" "$repo_root"

  docker run --rm --interactive --entrypoint wbs-solver "$image" <"$request" >/dev/null

  docker run --detach --rm --publish 127.0.0.1::5000 --name "$registry_name" registry:2 >/dev/null
  registry_port="$(
    docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' \
      "$registry_name"
  )"
  registry="127.0.0.1:$registry_port"
  for _attempt in 1 2 3 4 5 6 7 8 9 10; do
    curl --fail --silent --show-error --max-time 2 "http://$registry/v2/" >/dev/null && break
    sleep 1
  done
  curl --fail --silent --show-error --max-time 2 "http://$registry/v2/" >/dev/null
  registry_tag="$registry/wbs-be-01:solver-smoke-$attempt_token"
  created_images+=("$registry_tag")
  docker tag "$image" "$registry_tag"
  docker push "$registry_tag" >/dev/null
  mapfile -t matching_digests < <(
    docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$registry_tag" |
      grep --fixed-strings "$registry/wbs-be-01@"
  )
  if [ "${#matching_digests[@]}" -ne 1 ]; then
    echo "[solver-image-smoke] local registry did not produce one matching digest" >&2
    exit 1
  fi
  solver_image="${matching_digests[0]}"
  case "$solver_image" in
    *@sha256:????????????????????????????????????????????????????????????????) ;;
    *)
      echo "[solver-image-smoke] local registry did not produce a digest-pinned image" >&2
      exit 1
      ;;
  esac
fi

bun "$repo_root/tools/tool-remote-scripts/src/fixtures/solver-supervisor-image-host.ts" \
  "$solver_image" "$socket_path" "$caller_name" &
supervisor_pid=$!
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -S "$socket_path" ] && break
  kill -0 "$supervisor_pid"
  sleep 1
done
[ -S "$socket_path" ]

# Proof: removing only the launcher's project.scripts entry leaves the direct
# wbs-solver check green and makes this authenticated real-container bind fail.
docker run --rm "${client_pull[@]}" --name "$caller_name" \
  --volume "$socket_directory:/run/wbs-solver:ro" \
  --entrypoint bun "$solver_image" \
  /app/apps/wbs/be-01/scripts/solver-supervisor-image-client.ts \
  /run/wbs-solver/supervisor.sock \
  /app/libs/wbs/domain/contracts/solver/fixtures/request/valid-quantised-baseline.json \
  "$attempt_token"

# A second authenticated bind exercises wire 3 with a nonempty fixed person calendar.
# Proof: removing this invocation made solver-image-smoke.test.ts fail twice (client count and
# shared-client-failure case); the real digest image published a feasible shared-person answer.
shared_attempt_token="$(cat /proc/sys/kernel/random/uuid)"
attempt_tokens+=("$shared_attempt_token")
docker run --rm "${client_pull[@]}" --name "$caller_name" \
  --volume "$socket_directory:/run/wbs-solver:ro" \
  --entrypoint bun "$solver_image" \
  /app/apps/wbs/be-01/scripts/solver-supervisor-image-client.ts \
  /run/wbs-solver/supervisor.sock \
  shared-person \
  "$shared_attempt_token"

# Proof: removing this bind fails the client inventory and connected-feasible-run fault tests
# in both built and supplied image modes; each authenticated child owns a fresh token.
connected_feasible_token="$(cat /proc/sys/kernel/random/uuid)"
attempt_tokens+=("$connected_feasible_token")
docker run --rm "${client_pull[@]}" --name "$caller_name" \
  --volume "$socket_directory:/run/wbs-solver:ro" \
  --entrypoint bun "$solver_image" \
  /app/apps/wbs/be-01/scripts/solver-supervisor-image-client.ts \
  /run/wbs-solver/supervisor.sock \
  connected-feasible \
  "$connected_feasible_token"

# Proof: removing this bind fails the client inventory and connected-fractional-run fault tests
# in both built and supplied image modes; each authenticated child owns a fresh token.
connected_fractional_token="$(cat /proc/sys/kernel/random/uuid)"
attempt_tokens+=("$connected_fractional_token")
docker run --rm "${client_pull[@]}" --name "$caller_name" \
  --volume "$socket_directory:/run/wbs-solver:ro" \
  --entrypoint bun "$solver_image" \
  /app/apps/wbs/be-01/scripts/solver-supervisor-image-client.ts \
  /run/wbs-solver/supervisor.sock \
  connected-fractional \
  "$connected_fractional_token"

# This fifth client joins real SQLite/service admission, installed Python and durable publication.
# Proof: omitting this invocation fails both image inventories and composed-client fault tests.
docker run --rm "${client_pull[@]}" --name "$caller_name" \
  --volume "$socket_directory:/run/wbs-solver" \
  --entrypoint bun "$solver_image" \
  /app/apps/wbs/be-01/scripts/solver-supervisor-image-client.ts \
  /run/wbs-solver/supervisor.sock \
  connected-composed \
  /run/wbs-solver/composed-attempts

# CI runs the portable launcher half above. The canonical h2puni gate sets this
# flag because its puni1 user session owns the persistent systemd timer used by
# the real supervisor-restart proof.
if [ "${WBS_RUN_SOLVER_ORPHAN_PROC:-0}" = '1' ]; then
  orphan_registry_tag="$registry/wbs-be-01:solver-orphan-$attempt_token"
  created_images+=("$orphan_registry_tag")
  docker build \
    --file "$repo_root/apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile" \
    --build-arg "SOLVER_BASE_IMAGE=$solver_image" \
    --tag "$orphan_registry_tag" \
    "$repo_root"
  docker push "$orphan_registry_tag" >/dev/null
  mapfile -t orphan_digests < <(
    docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$orphan_registry_tag" |
      grep --fixed-strings "$registry/wbs-be-01@"
  )
  if [ "${#orphan_digests[@]}" -ne 1 ]; then
    echo '[solver-image-smoke] orphan fixture did not produce one matching digest' >&2
    exit 1
  fi
  WBS_SOLVER_ORPHAN_IMAGE="${orphan_digests[0]}" \
    bun test \
      apps/wbs/be-01/src/service/optimization-orphan.proc.db.test.ts \
      tools/tool-remote-scripts/src/lib/solver-supervisor-lifecycle.proc.test.ts
fi
