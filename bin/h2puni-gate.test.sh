#!/usr/bin/env bash
# Tests for the gate's head pinning.
#
# The bug these exist for was WATCHED, not theorised (TASK-328): every lane
# gates in one shared checkout on h2puni and each checked its own sha into that
# tree BEFORE calling the gate, so the checkout sat outside the mutex the gate
# steps run under. On 2026-09-07 lane b checked 9235c40d into ~/wbs-t267 26
# seconds into another lane's already-running gate; that gate then reported
# green about lane b's head, silently, and nothing failed loudly.
#
# Case 2 is the negative control: with the checkout back outside the lock it
# passes trivially, because moving the head while another run holds the lock is
# exactly what the old shape did.
#
# No heavy work runs here — the gate steps are an argument, so every case runs
# in well under a second against a scratch git repo.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
gate_lib="$repo_root/bin/h2puni-gate-lib.sh"

failures=0
fail() {
  printf '  FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}
pass() { printf '  ok: %s\n' "$1"; }

expect_status() {
  local want=$1 got=$2 what=$3
  if [[ $got -eq $want ]]; then pass "$what (exit $got)"; else fail "$what: want exit $want, got $got"; fi
}

expect_equal() {
  local want=$1 got=$2 what=$3
  if [[ $want == "$got" ]]; then pass "$what"; else fail "$what: want '$want', got '$got'"; fi
}

# A scratch repo with two commits, so a test can ask for one head while the
# working tree sits on the other.
make_repo() {
  local dir=$1
  git init -q -b main "$dir"
  git -C "$dir" config user.email gate-test@example.invalid
  git -C "$dir" config user.name 'gate test'
  printf 'a\n' >"$dir/f"
  git -C "$dir" add f
  git -C "$dir" commit -qm a
  printf 'b\n' >"$dir/f"
  git -C "$dir" commit -qam b
}

# The library entry point, given the lock path as an argument.
#
# The seam is that argument and nothing else, for the reason `heavy-lock-lib.sh`
# records: a caller able to choose its own lock path through the ENVIRONMENT is
# a caller able to opt out of the lock. Production takes the canonical path from
# `resolve_heavy_lock_path`.
run_gate() {
  local repo=$1 lock=$2 sha=$3
  shift 3
  # shellcheck disable=SC2016 # Single quotes are the point: `$1`/`$@` belong to
  # the inner shell, not to this one.
  local inner='source "$1"; shift; gate_with_pinned_head "$@"'
  HEAVY_LOCK_WAIT_SECONDS="${HEAVY_LOCK_WAIT_SECONDS:-0}" \
    bash -c "$inner" h2puni-gate-test "$gate_lib" "$repo" "$lock" "$sha" -- "$@"
}

run_launcher_resolution() {
  local activation_root=$1 candidate_root=$2
  bash -c 'source "$1"; resolve_tool_wiki_launcher "$2" "$3"' \
    h2puni-launcher-resolution "$gate_lib" "$activation_root" "$candidate_root"
}

run_modules_resolution() {
  local activation_root=$1 candidate_root=$2 modules_input=${3:-}
  bash -c 'source "$1"; resolve_tool_wiki_modules "$2" "$3" "$4"' \
    h2puni-modules-resolution "$gate_lib" "$activation_root" "$candidate_root" "$modules_input"
}

scratch="${TMPDIR:-/tmp}/wbs-h2puni-gate-test.$$"
rm -rf "$scratch"
mkdir -p "$scratch"
trap 'rm -rf "$scratch"' EXIT

lock="$scratch/lock"
repo="$scratch/repo"
make_repo "$repo"
sha_a=$(git -C "$repo" rev-parse HEAD~1)
sha_b=$(git -C "$repo" rev-parse HEAD)

status=0

# 1. The steps run on the sha the caller asked for, not on whatever head the
# shared tree happened to be left on. This is the whole point: the tree is at B,
# the gate was asked for A, and the steps must see A.
run_gate "$repo" "$lock" "$sha_a" bash -c 'git rev-parse HEAD >"$0"' "$scratch/seen-1" || status=$?
expect_status 0 "$status" 'gate on a pinned sha succeeds'
expect_equal "$sha_a" "$(cat "$scratch/seen-1" 2>/dev/null)" 'steps run on the requested sha, not the tree head'
expect_equal "$sha_a" "$(git -C "$repo" rev-parse HEAD)" 'the tree is left on the gated sha'

# 2. NEGATIVE CONTROL, and the case that fails when the checkout moves back
# outside the lock. Someone else holds the lock, so a refused gate must not have
# touched the head at all — under the old shape the caller had already checked
# its sha in before the gate was ever invoked, which is how one lane's gate came
# to report about another lane's head.
git -C "$repo" checkout -q --detach "$sha_b"
mkdir -p "$lock.d"
printf '%s\n' "$$" >"$lock.d/holder" # this test process is alive, so not stale
status=0
HEAVY_LOCK_WAIT_SECONDS=0 run_gate "$repo" "$lock" "$sha_a" true 2>/dev/null || status=$?
expect_status 75 "$status" 'a gate refused for a held lock exits 75'
expect_equal "$sha_b" "$(git -C "$repo" rev-parse HEAD)" 'a refused gate leaves the head where it found it'
rm -rf "$lock.d"

# 3. The interleaving, closed: two gates race for one shared tree and each one's
# steps see its own sha. The second queues rather than refusing, which is what
# `HEAVY_LOCK_WAIT_SECONDS` buys.
(
  run_gate "$repo" "$lock" "$sha_a" bash -c 'git rev-parse HEAD >"$0"; sleep 3' "$scratch/seen-first"
) &
first=$!
# Wait for the first to actually hold the lock before racing it, rather than
# assuming a sleep is long enough.
for _ in $(seq 1 50); do
  [[ -d $lock.d ]] && break
  sleep 0.1
done
status=0
HEAVY_LOCK_WAIT_SECONDS=30 run_gate "$repo" "$lock" "$sha_b" bash -c 'git rev-parse HEAD >"$0"' "$scratch/seen-second" || status=$?
wait "$first"
expect_status 0 "$status" 'the second gate queues behind the first and runs'
expect_equal "$sha_a" "$(cat "$scratch/seen-first" 2>/dev/null)" 'the first gate ran on its own sha'
expect_equal "$sha_b" "$(cat "$scratch/seen-second" 2>/dev/null)" 'the second gate ran on its own sha, not the first one'

# 4. A sha that is not a commit in this repo is refused before the lock is taken,
# so a typo cannot park the host-wide mutex for the length of a gate.
status=0
run_gate "$repo" "$lock" 0000000000000000000000000000000000000000 true 2>/dev/null || status=$?
expect_status 64 "$status" 'an unknown sha is refused'
if [[ -d $lock.d ]]; then fail 'an unknown sha took the lock'; else pass 'an unknown sha never took the lock'; fi

# 5. Contract check: the shipped gate queues by default. A gate that refuses
# immediately burns the caller's whole run box (see the comment at that line).
if grep -q 'HEAVY_LOCK_WAIT_SECONDS:=[1-9]' "$repo_root/bin/h2puni-gate.sh"; then
  pass 'bin/h2puni-gate.sh defaults to queueing, not refusing'
else
  fail 'bin/h2puni-gate.sh does not set a non-zero HEAVY_LOCK_WAIT_SECONDS default'
fi

# 6. A pinned head is not a pinned tree. `checkout --detach` leaves
# non-conflicting tracked edits and every untracked file in place, and Nx reads
# the tree — so the gate must refuse rather than report a verdict about bytes the
# commit does not contain. Both shapes are checked, because they survive a
# checkout for different reasons.
git -C "$repo" checkout -q --detach "$sha_b"
printf 'local edit\n' >>"$repo/f"
status=0
run_gate "$repo" "$lock" "$sha_b" bash -c 'echo ran >"$0"' "$scratch/ran-dirty" 2>/dev/null || status=$?
expect_status 65 "$status" 'a tracked edit surviving the checkout is refused'
if [[ -e $scratch/ran-dirty ]]; then fail 'the steps ran over a modified tracked file'; else pass 'the steps never ran over a modified tracked file'; fi
git -C "$repo" checkout -q -- f

# 400 untracked files, so the refusal has to truncate. The status must still be
# the documented 65 and the listing must be bounded: an earlier cut of this code
# truncated with `printf … | head -10`, where a large enough listing makes the
# builtin `printf` take SIGPIPE and `set -euo pipefail` report 141 instead — the
# refusal replaced by a signal on the dirtiest trees. There is no pipe there now.
#
# This case is a real guard here, not merely a contract pin: restoring
# `printf "  %s\n" $dirty | head -10` in h2puni-gate-lib.sh was watched on this
# workstation failing three of its own assertions —
#   FAIL: an untracked file the commit does not contain is refused: want exit 65, got 141
#   FAIL: a 400-file refusal lists ten paths and says how many more: want '11', got '10'
#   FAIL: the refusal did not report the remaining count
# — at these 400 files with 200-character names, well under the 4,000,151-byte
# listing the round-3 peer needed. Observed 2026-09-10; the earlier note saying
# an 88 KB listing did not reproduce it is about a different pipe buffer, not
# about this case being unable to fail.
long_name=$(printf 'u%.0s' $(seq 1 200))
for i in $(seq 1 400); do printf 'stray\n' >"$repo/untracked-$i-$long_name.ts"; done
status=0
run_gate "$repo" "$lock" "$sha_b" bash -c 'echo ran >"$0"' "$scratch/ran-untracked" 2>"$scratch/refusal-stderr" || status=$?
expect_status 65 "$status" 'an untracked file the commit does not contain is refused'
if [[ -e $scratch/ran-untracked ]]; then fail 'the steps ran over an untracked file'; else pass 'the steps never ran over an untracked file'; fi
listed=$(grep -c '^  ' "$scratch/refusal-stderr" || true)
# Ten paths plus the "… and N more" line: bounded, and it says what it hid.
expect_equal 11 "$listed" 'a 400-file refusal lists ten paths and says how many more'
if grep -q '… and 390 more' "$scratch/refusal-stderr"; then pass 'the refusal counts the paths it did not print'; else fail 'the refusal did not report the remaining count'; fi
rm -f "$repo"/untracked-*.ts

# 7. Contract check: that default reaches the lock as a shell variable and stops
# there. Exported, it would enter every gate step's environment, and
# `bin/heavy-lock.test.sh`'s refusal cases forward `${HEAVY_LOCK_WAIT_SECONDS:-0}`
# from theirs — under a gate they would inherit 1800 and spin for half an hour
# instead of asserting an immediate refusal. That false red has been watched once
# already, from the command-line recipe (`tools/tool-dagger/src/heavy-lock.test.ts:54`).
if grep -q '^[[:space:]]*export[[:space:]]\+HEAVY_LOCK_WAIT_SECONDS' "$repo_root/bin/h2puni-gate.sh"; then
  fail 'bin/h2puni-gate.sh exports its wait default into the gate steps'
else
  pass 'the wait default stops at the lock and never enters the steps environment'
fi

# 8. A rejected candidate cannot become the checkout the next invocation trusts.
git -C "$repo" checkout -q main
status=0
run_gate "$repo" "$lock" "$sha_a" false 2>"$scratch/rejected-stderr" || status=$?
expect_status 1 "$status" 'a rejected candidate preserves its command status'
expect_equal main "$(git -C "$repo" symbolic-ref --short HEAD)" 'a rejected gate restores the pre-gate branch'
expect_equal "$sha_b" "$(git -C "$repo" rev-parse HEAD)" 'a rejected gate restores the pre-gate commit'
status=0
run_gate "$repo" "$lock" "$sha_a" bash -c 'test "$(git rev-parse HEAD)" = "$1"' gate-second "$sha_a" || status=$?
expect_status 0 "$status" 'a second gate starts from restored trusted checkout state'

git -C "$repo" checkout -q --detach "$sha_b"
status=0
run_gate "$repo" "$lock" "$sha_a" false 2>/dev/null || status=$?
expect_status 1 "$status" 'a rejected candidate from detached state preserves its status'
if git -C "$repo" symbolic-ref -q HEAD >/dev/null; then
  fail 'a rejected gate changed the original detached checkout into a branch'
else
  pass 'a rejected gate preserves detached checkout shape'
fi
expect_equal "$sha_b" "$(git -C "$repo" rev-parse HEAD)" 'a rejected gate restores detached commit'

# 9. A branch may move independently while the gate runs. Recovery must not overwrite that
# newer ref or silently restore different bytes: it leaves the exact saved commit detached and
# reports that the original symbolic state could not be reconstructed.
git -C "$repo" checkout -q main
status=0
run_gate "$repo" "$lock" "$sha_a" bash -c 'git update-ref refs/heads/main "$1"; exit 1' \
  gate-move "$sha_a" 2>"$scratch/ref-move-failure" || status=$?
expect_status 74 "$status" 'a concurrently moved original branch is a loud restore failure'
expect_equal "$sha_a" "$(git -C "$repo" rev-parse refs/heads/main)" 'restore does not overwrite the concurrently moved branch'
expect_equal "$sha_b" "$(git -C "$repo" rev-parse HEAD)" 'restore preserves the exact saved commit after a branch move'
if git -C "$repo" symbolic-ref -q HEAD >/dev/null; then
  fail 'a moved branch left the checkout attached to different bytes'
else
  pass 'a moved branch leaves the saved commit recoverable in detached state'
fi
if grep -q 'original branch moved during gate' "$scratch/ref-move-failure"; then
  pass 'concurrent ref movement names the failed symbolic restore'
else
  fail 'concurrent ref movement did not name the failed symbolic restore'
fi

# 10. Restore is required state recovery, so losing its ref must replace the candidate failure.
git -C "$repo" update-ref refs/heads/main "$sha_b"
git -C "$repo" checkout -q main
status=0
run_gate "$repo" "$lock" "$sha_a" bash -c 'git branch -D main >/dev/null; exit 1' \
  2>"$scratch/restore-failure" || status=$?
expect_status 74 "$status" 'a failed checkout restore is loud'
if grep -q 'failed to restore pre-gate checkout' "$scratch/restore-failure"; then
  pass 'restore failure names the lost safety recovery'
else
  fail 'restore failure did not name the lost safety recovery'
fi

# 11. Activation-package descriptors are relative to their activation root. The transport root
# holds a preserved bootstrap launcher beside its descriptor, so resolution must not depend on the
# candidate checkout or the caller's current directory.
activation_root="$scratch/activation"
candidate_root="$scratch/candidate"
mkdir -p "$activation_root" "$candidate_root"
printf 'tool-wiki-active-v1\n' >"$activation_root/active-v1"
printf 'bootstrap-launcher.sh\n' >"$activation_root/launcher-path"
printf '#!/usr/bin/env bash\nexit 0\n' >"$activation_root/bootstrap-launcher.sh"
chmod 0555 "$activation_root/bootstrap-launcher.sh"
status=0
resolved=$(cd "$candidate_root" && run_launcher_resolution "$activation_root" "$candidate_root") || status=$?
expect_status 0 "$status" 'a relative launcher descriptor resolves from its activation root'
expect_equal "$(realpath "$activation_root/bootstrap-launcher.sh")" "$resolved" 'launcher resolution is independent of caller cwd'

# 12. Prefixing relative descriptors must retain the existing external-trust boundary: a symlink
# back into the candidate is refused before any candidate launcher can run.
printf '#!/usr/bin/env bash\nexit 0\n' >"$candidate_root/candidate-launcher.sh"
ln -s "$candidate_root/candidate-launcher.sh" "$activation_root/candidate-link.sh"
printf 'candidate-link.sh\n' >"$activation_root/launcher-path"
status=0
run_launcher_resolution "$activation_root" "$candidate_root" >/dev/null 2>"$scratch/launcher-refusal" || status=$?
expect_status 78 "$status" 'a relative launcher symlink into the candidate is refused'
if grep -q 'launcher must be outside the candidate checkout' "$scratch/launcher-refusal"; then
  pass 'candidate-contained launcher refusal names the trust boundary'
else
  fail 'candidate-contained launcher refusal did not name the trust boundary'
fi

# 13. A marker is an exact activation decision, not an existence flag. A malformed marker must
# fail before any descriptor or launcher is considered.
printf 'not-active\n' >"$activation_root/active-v1"
status=0
run_launcher_resolution "$activation_root" "$candidate_root" >/dev/null 2>"$scratch/marker-refusal" || status=$?
expect_status 78 "$status" 'a malformed activation marker is refused'
if grep -q 'marker is missing, unreadable, or malformed' "$scratch/marker-refusal"; then
  pass 'malformed marker refusal names the invalid activation decision'
else
  fail 'malformed marker refusal did not name the invalid activation decision'
fi

# 14. An unreadable descriptor cannot silently select a default launcher.
printf 'tool-wiki-active-v1\n' >"$activation_root/active-v1"
chmod 000 "$activation_root/launcher-path"
status=0
run_launcher_resolution "$activation_root" "$candidate_root" >/dev/null 2>"$scratch/descriptor-refusal" || status=$?
expect_status 78 "$status" 'an unreadable launcher descriptor is refused'
if grep -q 'no readable launcher descriptor' "$scratch/descriptor-refusal"; then
  pass 'unreadable descriptor refusal names the missing authority'
else
  fail 'unreadable descriptor refusal did not name the missing authority'
fi
chmod 0644 "$activation_root/launcher-path"

# 15. A descriptor naming a directory is not an executable authority artifact.
printf '.\n' >"$activation_root/launcher-path"
status=0
run_launcher_resolution "$activation_root" "$candidate_root" >/dev/null 2>"$scratch/file-refusal" || status=$?
expect_status 78 "$status" 'a launcher descriptor naming a directory is refused'
if grep -q 'launcher is not a readable regular file' "$scratch/file-refusal"; then
  pass 'non-file launcher refusal names the invalid artifact shape'
else
  fail 'non-file launcher refusal did not name the invalid artifact shape'
fi

# 16. Trust roots are external state. Even an outward-pointing launcher cannot make a root inside
# the candidate checkout authoritative.
candidate_activation="$candidate_root/activation"
mkdir -p "$candidate_activation"
printf 'tool-wiki-active-v1\n' >"$candidate_activation/active-v1"
printf '%s\n' "$activation_root/bootstrap-launcher.sh" >"$candidate_activation/launcher-path"
status=0
run_launcher_resolution "$candidate_activation" "$candidate_root" >/dev/null 2>"$scratch/root-refusal" || status=$?
expect_status 78 "$status" 'an activation root inside the candidate is refused'
if grep -q 'activation root must be outside the candidate checkout' "$scratch/root-refusal"; then
  pass 'candidate-contained activation root refusal names the trust boundary'
else
  fail 'candidate-contained activation root refusal did not name the trust boundary'
fi

# 17. The production host entrypoint must propagate resolver refusal before it takes the heavy
# lock. A candidate-contained launcher is selected through a real external descriptor.
host_activation="$scratch/host-activation"
mkdir -p "$host_activation"
printf 'tool-wiki-active-v1\n' >"$host_activation/active-v1"
ln -s "$repo_root/bin/h2puni-gate.sh" "$host_activation/candidate-link.sh"
printf 'candidate-link.sh\n' >"$host_activation/launcher-path"
status=0
TOOL_WIKI_ACTIVATION_ROOT="$host_activation" \
  bash "$repo_root/bin/h2puni-gate.sh" HEAD >"$scratch/host-entrypoint-stdout" \
  2>"$scratch/host-entrypoint-stderr" || status=$?
expect_status 78 "$status" 'the host entrypoint propagates a candidate-launcher refusal'
if grep -q 'launcher must be outside the candidate checkout' "$scratch/host-entrypoint-stderr"; then
  pass 'the host entrypoint names the external launcher boundary'
else
  fail 'the host entrypoint did not name the external launcher boundary'
fi
if grep -q 'h2puni gate: running on' "$scratch/host-entrypoint-stderr"; then
  fail 'the host entrypoint took the heavy gate after resolver refusal'
else
  pass 'the host entrypoint refuses before taking the heavy gate'
fi

# 18. Once an activation root is configured, losing its marker is a provisioning failure rather
# than permission to silently fall back to an uncertified candidate-only gate.
missing_marker_activation="$scratch/missing-marker-activation"
mkdir -p "$missing_marker_activation"
status=0
TOOL_WIKI_ACTIVATION_ROOT="$missing_marker_activation" \
  bash "$repo_root/bin/h2puni-gate.sh" HEAD >"$scratch/missing-marker-stdout" \
  2>"$scratch/missing-marker-stderr" || status=$?
expect_status 78 "$status" 'a configured host activation with no marker is refused'
if grep -q 'configured activation has no external marker' "$scratch/missing-marker-stderr"; then
  pass 'the missing host marker names the lost provisioning state'
else
  fail 'the missing host marker was treated as an inactive rollout'
fi
if grep -q 'h2puni gate: running on' "$scratch/missing-marker-stderr"; then
  fail 'the host entrypoint took the heavy gate after losing its activation marker'
else
  pass 'the missing host marker is refused before taking the heavy gate'
fi

# 19. A relocated archive carries its external TypeScript runtime below the activation root, so
# the active host gate has a usable default without trusting the candidate checkout's install.
runtime_root="$scratch/runtime-activation"
mkdir -p "$runtime_root/trusted-node-modules/typescript"
printf '{}\n' >"$runtime_root/trusted-node-modules/typescript/package.json"
status=0
resolved=$(run_modules_resolution "$runtime_root" "$candidate_root") || status=$?
expect_status 0 "$status" 'the host runtime defaults below the external activation root'
expect_equal "$(realpath "$runtime_root/trusted-node-modules")" "$resolved" 'the default runtime is relocatable and external'

# 20. An archive that loses its runtime is incomplete activation state, not permission to fall
# back to the candidate's node_modules.
missing_runtime_root="$scratch/missing-runtime-activation"
mkdir -p "$missing_runtime_root"
status=0
run_modules_resolution "$missing_runtime_root" "$candidate_root" >/dev/null \
  2>"$scratch/missing-runtime-stderr" || status=$?
expect_status 78 "$status" 'a missing external TypeScript runtime is refused'
if grep -q 'trusted TypeScript runtime modules are not provisioned' "$scratch/missing-runtime-stderr"; then
  pass 'the missing runtime refusal names the lost provisioning state'
else
  fail 'the missing runtime refusal did not name the lost provisioning state'
fi

# 21. An explicit override remains external authority; configuration cannot select modules from
# the candidate checkout and thereby make reviewed relationship extraction execute candidate bytes.
mkdir -p "$candidate_root/node_modules/typescript"
printf '{}\n' >"$candidate_root/node_modules/typescript/package.json"
status=0
run_modules_resolution "$runtime_root" "$candidate_root" "$candidate_root/node_modules" \
  >/dev/null 2>"$scratch/candidate-runtime-stderr" || status=$?
expect_status 78 "$status" 'candidate-owned TypeScript runtime modules are refused'
if grep -q 'runtime modules must be outside the candidate checkout' "$scratch/candidate-runtime-stderr"; then
  pass 'the candidate runtime refusal names the trust boundary'
else
  fail 'the candidate runtime refusal did not name the trust boundary'
fi

if ((failures)); then
  printf '\n%d failing case(s)\n' "$failures" >&2
  exit 1
fi
printf '\nall cases passed\n'
