#!/usr/bin/env bash
set -euo pipefail

script=$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")/puni-website-prod-reset.sh
scenario=$(mktemp -d)
trap 'rm -rf -- "$scenario"' EXIT
export PUNI_TEST_OPENED="$scenario/opened"
cat > "$scenario/xdg-open" <<'INNER'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$PUNI_TEST_OPENED"
INNER
chmod +x "$scenario/xdg-open"
export PATH="$scenario:$PATH"
target='https://request.puni.dev/#reset-chat'

[[ $("$script" --print) == "$target" ]]
[[ ! -e "$PUNI_TEST_OPENED" ]]
[[ $("$script" --help) == *'Usage: puni-website-prod-reset'* ]]
if "$script" --restart-api >"$scenario/stdout" 2>"$scenario/stderr"; then
  echo 'unexpected option accepted' >&2
  exit 1
fi
[[ ! -e "$PUNI_TEST_OPENED" ]]
"$script"
[[ $(cat "$PUNI_TEST_OPENED") == "$target" ]]
