#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: puni-website-local-reset [--app URL] [--api URL] [--print] [-h|--help]
       puni-website-local-reset --env

Resets the testing limits of a local (loopback) website run for the browser that
opens the reset link, keeping the conversation. It is the local twin of
puni-website-dev-reset: the app's #test-reset=<secret> link and POST /testing/reset.

One-time setup: start the local API with the secret in its environment.
  export "$(bin/puni-website-local-reset.sh --env)"   # creates the secret once
  bun apps/website/be-01/src/main.ts                   # or browser/conversation-api.mjs

Options:
  --env      Print WEBSITE_TEST_RESET_SECRET=<secret> for the API's environment,
             creating the secret file first when it is absent.
  --app URL  Local Build app origin (default http://localhost:4201).
  --api URL  Local website API origin (default http://localhost:3101).
  --print    Print the reset URL instead of opening it. The URL contains the secret.
  -h, --help Show this help.

Resets:  the current draft's or browser's conversation allowances (3 per day).
Keeps:   site spend caps, site-wide capacity, pauses and the in-memory request
         windows; restart the local API to clear those windows.
Local only: both origins must be loopback; the API refuses anything else too.

Environment:
  PUNI_LOCAL_RESET_SECRET_FILE  secret file (default ~/.config/puni/website-test-reset-secret)
  CURL                          curl to use (default: curl)
EOF
}

secret_file=${PUNI_LOCAL_RESET_SECRET_FILE:-$HOME/.config/puni/website-test-reset-secret}
curl=${CURL:-curl}
app=http://localhost:4201
api=http://localhost:3101
print=0
env_only=0
while (($# > 0)); do
  case $1 in
    --app) app=${2:?--app needs a URL}; shift ;;
    --api) api=${2:?--api needs a URL}; shift ;;
    --print) print=1 ;;
    --env) env_only=1 ;;
    -h | --help) usage; exit 0 ;;
    *) printf 'unknown argument: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ((env_only)); then
  if [[ ! -e $secret_file ]]; then
    mkdir -p "$(dirname "$secret_file")"
    (umask 077 && od -An -N32 -tx1 /dev/urandom | tr -d ' \n' >"$secret_file")
  fi
fi

if [[ ! -f $secret_file || ! -r $secret_file ]]; then
  echo "cannot read $secret_file; create it with: bin/puni-website-local-reset.sh --env" >&2
  exit 1
fi
secret=$(<"$secret_file")
# Proof: replacing this test with `false` made the malformed-file case of
# puni-website-local-reset.test.sh print a reset link and exit 0.
if [[ ! $secret =~ ^[0-9a-f]{64}$ ]]; then
  echo "$secret_file is not 64 lowercase hex; delete it and rerun with --env" >&2
  exit 1
fi
if ((env_only)); then
  printf 'WEBSITE_TEST_RESET_SECRET=%s\n' "$secret"
  exit 0
fi

# The secret never leaves this machine: a non-loopback origin would receive it in a link.
# Proof: replacing this test with `false` made the remote-app case print a reset link and exit 0.
for origin in "$app" "$api"; do
  if [[ ! $origin =~ ^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/?$ ]]; then
    echo "$origin is not a loopback origin; this script resets local runs only" >&2
    exit 1
  fi
done
app=${app%/}
api=${api%/}

# Without the secret header an enabled API answers testing_reset_forbidden; a disabled one
# not_found; an app origin the API does not serve origin_forbidden.
answer=$("$curl" -s -X POST -H "Origin: $app" "$api/testing/reset") || {
  echo "the local API at $api is not reachable" >&2
  exit 1
}
case $answer in
  *'"testing_reset_forbidden"'*) ;;
  # Proof: matching a code the API never sends here made the without-secret case report "unexpected".
  *'"not_found"'*)
    echo "the API at $api runs without WEBSITE_TEST_RESET_SECRET; restart it after:" >&2
    # shellcheck disable=SC2016 # the command is printed literally for the user to paste
    echo '  export "$(bin/puni-website-local-reset.sh --env)"' >&2
    exit 1
    ;;
  *'"origin_forbidden"'*)
    echo "the API at $api does not serve the app origin $app; pass the right --app" >&2
    exit 1
    ;;
  *)
    echo "unexpected answer from $api/testing/reset: $answer" >&2
    exit 1
    ;;
esac

url="$app/#test-reset=$secret"
if ((print)); then
  printf '%s\n' "$url"
else
  xdg-open "$url" >/dev/null 2>&1
  echo "opened the reset link in the default browser; test in that browser"
fi
