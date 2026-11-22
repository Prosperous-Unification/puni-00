#!/usr/bin/env bash
# Negative tests for `bin/puni-website-dev-reset.sh`. The seam is `KUBECTL`: each case points it at
# a fake that answers the Secret read as told, so no case reaches the cluster or a browser.
set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_root/bin/puni-website-dev-reset.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0
valid=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Writes a kubectl that prints the base64 of $2 for the Secret read, or exits $3 when given.
make_fake_kubectl() {
  local path=$1 value=$2 code=${3:-0}
  cat >"$path" <<FAKE
#!/usr/bin/env bash
[ "$code" = 0 ] || exit $code
printf '%s' '$(printf '%s' "$value" | base64 -w0)'
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
  local fake=$1
  shift
  KUBECTL=$fake bash "$script" "$@" 2>&1
}

make_fake_kubectl "$work/valid" "$valid"
out=$(run_case "$work/valid" --print)
expect 'valid secret prints the reset link' 0 "https://dev.request.puni.dev/#test-reset=$valid" $? "$out"

make_fake_kubectl "$work/absent" ''
out=$(run_case "$work/absent" --print)
expect 'absent secret refuses' 1 'missing or not 64 lowercase hex' $? "$out"

make_fake_kubectl "$work/malformed" "${valid^^}"
out=$(run_case "$work/malformed" --print)
expect 'uppercase secret refuses' 1 'missing or not 64 lowercase hex' $? "$out"

make_fake_kubectl "$work/unreadable" '' 7
out=$(run_case "$work/unreadable" --print)
code=$?
if [ "$code" = 0 ] || [[ $out == *test-reset=* ]]; then
  printf 'FAIL unreadable secret: exit %s, output: %s\n' "$code" "$out" >&2
  failures=$((failures + 1))
else
  printf 'ok   unreadable secret fails\n'
fi

out=$(run_case "$work/valid" --bogus)
expect 'unknown argument prints usage' 2 'Usage: puni-website-dev-reset' $? "$out"

out=$(run_case "$work/valid" --help)
expect 'help exits zero' 0 'Usage: puni-website-dev-reset' $? "$out"

[ "$failures" = 0 ] || { printf '%s case(s) failed\n' "$failures" >&2; exit 1; }
