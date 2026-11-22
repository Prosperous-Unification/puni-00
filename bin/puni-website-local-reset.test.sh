#!/usr/bin/env bash
# Negative tests for `bin/puni-website-local-reset.sh`. The seams are `CURL` (a fake answering the
# API probe as told) and `PUNI_LOCAL_RESET_SECRET_FILE`, so no case reaches an API or a browser.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_root/bin/puni-website-local-reset.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0
valid=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Writes a curl that prints $2 as the response body, or exits $3 when given.
make_fake_curl() {
  local path=$1 body=$2 code=${3:-0}
  cat >"$path" <<FAKE
#!/usr/bin/env bash
[ "$code" = 0 ] || exit $code
printf '%s' '$body'
FAKE
  chmod +x "$path"
}

expect() {
  local name=$1 want_code=$2 want_text=$3 got_code=$4 got_text=$5
  if [ "$got_code" != "$want_code" ] || [[ $got_text != *"$want_text"* ]]; then
    printf 'FAIL %s: exit %s (want %s), output: %s\n' "$name" "$got_code" "$want_code" "$got_text" >&2
    failures=$((failures + 1))
  else
    printf 'ok   %s\n' "$name"
  fi
}

run_case() {
  local fake=$1 file=$2
  shift 2
  CURL=$fake PUNI_LOCAL_RESET_SECRET_FILE=$file bash "$script" "$@" 2>&1
}

printf '%s' "$valid" >"$work/secret"
make_fake_curl "$work/enabled" '{"code":"testing_reset_forbidden"}'
make_fake_curl "$work/disabled" '{"code":"not_found"}'
make_fake_curl "$work/foreign" '{"code":"origin_forbidden"}'
make_fake_curl "$work/down" '' 7

out=$(run_case "$work/enabled" "$work/secret" --print --app http://localhost:4291)
expect 'enabled API prints the local reset link' 0 "http://localhost:4291/#test-reset=$valid" $? "$out"

out=$(run_case "$work/disabled" "$work/secret" --print)
expect 'API without the secret refuses' 1 'runs without WEBSITE_TEST_RESET_SECRET' $? "$out"

out=$(run_case "$work/foreign" "$work/secret" --print)
expect 'wrong app origin refuses' 1 'does not serve the app origin' $? "$out"

out=$(run_case "$work/down" "$work/secret" --print)
expect 'unreachable API refuses' 1 'is not reachable' $? "$out"

out=$(run_case "$work/enabled" "$work/secret" --print --app https://dev.request.puni.dev)
expect 'remote app origin refuses' 1 'not a loopback origin' $? "$out"

out=$(run_case "$work/enabled" "$work/secret" --print --api http://10.0.0.5:3101)
expect 'remote API origin refuses' 1 'not a loopback origin' $? "$out"

out=$(run_case "$work/enabled" "$work/absent" --print)
expect 'absent secret file refuses' 1 'cannot read' $? "$out"

printf '%s' "${valid^^}" >"$work/upper"
out=$(run_case "$work/enabled" "$work/upper" --print)
expect 'malformed secret file refuses' 1 'not 64 lowercase hex' $? "$out"

out=$(run_case "$work/enabled" "$work/new/secret" --env)
code=$?
mode=$(stat -c %a "$work/new/secret" 2>/dev/null)
if [ "$code" != 0 ] || [[ ! $out =~ ^WEBSITE_TEST_RESET_SECRET=[0-9a-f]{64}$ ]] || [ "$mode" != 600 ]; then
  printf 'FAIL --env creates a private secret: exit %s, mode %s, output: %s\n' "$code" "$mode" "$out" >&2
  failures=$((failures + 1))
else
  printf 'ok   --env creates a private secret\n'
fi
again=$(run_case "$work/enabled" "$work/new/secret" --env)
expect '--env keeps an existing secret' 0 "$out" $? "$again"

out=$(run_case "$work/enabled" "$work/secret" --bogus)
expect 'unknown argument prints usage' 2 'Usage: puni-website-local-reset' $? "$out"

out=$(run_case "$work/enabled" "$work/secret" --help)
expect 'help exits zero' 0 'Usage: puni-website-local-reset' $? "$out"

[ "$failures" = 0 ] || { printf '%s case(s) failed\n' "$failures" >&2; exit 1; }
