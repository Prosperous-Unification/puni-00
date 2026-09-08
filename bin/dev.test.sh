#!/usr/bin/env bash
# Negative tests for `bin/dev.sh`'s two guards.
#
# The seam is PATH, not an option: each case puts a fake `bunx` in front of the
# real one and lets the script run exactly the command line it always runs.
# Nothing here can ask `bin/dev.sh` to behave differently from the way a
# developer or the dev container invokes it.
#
# Both guards have been watched failing with the guard deliberately removed; the
# injected fault and what it printed are recorded in the `Proof:` comments in
# `bin/dev.sh`.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dev_sh="$repo_root/bin/dev.sh"
failures=0

# A `bunx` that prints one coloured line to each stream and exits as told, so a
# case can choose whether nx "died" without waiting on a real dev server, which
# never exits at all.
make_fake_bunx() {
  local dir=$1 code=$2
  mkdir -p "$dir"
  cat >"$dir/bunx" <<FAKE
#!/usr/bin/env bash
# \$PPID is the shell that ran us: with \`exec\` that is bin/dev.sh's own pid,
# and without it an extra subshell sits in between.
printf '%s\n' "\$*" >"$dir/argv"
printf '%s\n' "\$PPID" >"$dir/parent"
printf '\033[32mfake nx up\033[39m\n'
printf '\033[31mfake nx warning\033[39m\n' >&2
exit $code
FAKE
  chmod +x "$dir/bunx"
}

check() {
  local name=$1 expected=$2 actual=$3
  if [[ "$expected" == "$actual" ]]; then
    printf 'ok   %s\n' "$name"
  else
    printf 'FAIL %s\n     expected: %s\n     actual:   %s\n' "$name" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

run_case() {
  local tmp=$1 code=$2 log=$3
  shift 3
  make_fake_bunx "$tmp/bin" "$code"
  PATH="$tmp/bin:$PATH" WBS_DEV_LOG="$log" bash "$dev_sh" "$@" \
    >"$tmp/stdout" 2>"$tmp/stderr"
}

# The nx target the fake was actually asked for.
asked_target() {
  sed -E 's/.*run-many -t ([^ ]+).*/\1/' "$1/bin/argv"
}

# 1. The captured file is written, and it is what the run printed.
tmp=$(mktemp -d)
run_case "$tmp" 0 "$tmp/logs/dev.log"
check 'captured file exists' 'yes' "$([[ -f "$tmp/logs/dev.log" ]] && echo yes || echo no)"
check 'captured file has the output' 'yes' \
  "$(grep -q 'fake nx up' "$tmp/logs/dev.log" && echo yes || echo no)"
rm -rf "$tmp"

# 2. Colour reaches the terminal and never reaches the file.
#    Proof target: the `awk` strip in bin/dev.sh.
tmp=$(mktemp -d)
run_case "$tmp" 0 "$tmp/dev.log"
check 'terminal stream keeps colour' 'yes' \
  "$(grep -q $'\033\[' "$tmp/stdout" && echo yes || echo no)"
check 'captured file has no escape bytes' 'yes' \
  "$(grep -q $'\033\[' "$tmp/dev.log" && echo no || echo yes)"
rm -rf "$tmp"

# 3. A dead nx is a failed run.
#    Proof target: `pipefail` in bin/dev.sh.
tmp=$(mktemp -d)
run_case "$tmp" 3 "$tmp/dev.log"
check 'a failing nx exits non-zero' '3' "$?"
rm -rf "$tmp"

# 4. Without the variable nothing is captured, because the deployed container
#    runs this path and must keep the behaviour it had before this file existed.
tmp=$(mktemp -d)
make_fake_bunx "$tmp/bin" 0
PATH="$tmp/bin:$PATH" bash "$dev_sh" >"$tmp/stdout" 2>"$tmp/stderr"
check 'default path writes no log' 'yes' \
  "$([[ -z "$(find "$tmp" -name '*.log' -print -quit)" ]] && echo yes || echo no)"
rm -rf "$tmp"

# 5. The flag swaps ONLY be-01's entrypoint, through one run-many.
#    Proof target: the `--local-solver` branch in bin/dev.sh.
tmp=$(mktemp -d)
run_case "$tmp" 0 "$tmp/dev.log" --local-solver
check 'local solver target' 'serve-local-solver' "$(asked_target "$tmp")"
check 'local solver keeps one nx invocation' '1' "$(wc -l <"$tmp/bin/argv" | tr -d ' ')"
check 'local solver runs all four tiers' 'yes' \
  "$(grep -q -- '--projects=be-01,gw-01,fe-01,mcp-01' "$tmp/bin/argv" && echo yes || echo no)"
rm -rf "$tmp"

# 6. No argument is still the ordinary supervised dev stack, because that path
#    is the dev container's CMD.
#    Proof target: `target=serve` in bin/dev.sh.
tmp=$(mktemp -d)
run_case "$tmp" 0 "$tmp/dev.log"
check 'default target' 'serve' "$(asked_target "$tmp")"
rm -rf "$tmp"

# 7. An argument this script does not understand stops before nx runs at all.
#    Proof target: the usage branch in bin/dev.sh.
tmp=$(mktemp -d)
make_fake_bunx "$tmp/bin" 0
# No `set -e` juggling: this suite runs without errexit on purpose, and turning
# it on here aborted the whole file at the next deliberately-failing case.
refused=0
PATH="$tmp/bin:$PATH" bash "$dev_sh" --nonsense >"$tmp/stdout" 2>"$tmp/stderr" || refused=$?
check 'unknown argument exits 2' '2' "$refused"
check 'unknown argument never reaches nx' 'yes' \
  "$([[ -f "$tmp/bin/argv" ]] && echo no || echo yes)"
rm -rf "$tmp"

# 8. A dead nx is still a failed run in local-solver mode.
#    Proof target: `pipefail`, reached through the new argument path.
tmp=$(mktemp -d)
failed=0
run_case "$tmp" 3 "$tmp/dev.log" --local-solver || failed=$?
check 'local solver nx failure propagates' '3' "$failed"
rm -rf "$tmp"

if [[ $failures -gt 0 ]]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
