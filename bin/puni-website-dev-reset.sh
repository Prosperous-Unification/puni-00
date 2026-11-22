#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: puni-website-dev-reset [--print] [--restart-api] [-h|--help]

Resets the testing limits on dev.request.puni.dev for the browser that opens the
reset link. Reads WEBSITE_TEST_RESET_SECRET from the website-dev/website-runtime
Secret and opens https://dev.request.puni.dev/#test-reset=<secret>.

Options:
  --print        Print the reset URL instead of opening it, to paste into a
                 browser other than the default. The URL contains the secret.
  --restart-api  Also restart the dev API, which clears its in-memory request
                 windows (120/min per source, 30/min per write route).
  -h, --help     Show this help.

Resets:  the current draft's or browser's conversation allowances.
Keeps:   site spend caps, site-wide fresh-conversation capacity, pauses,
         concurrency slots, and the limits of other browsers on the same IP.
Dev only: the app refuses the reset on production origins.

Environment:
  KUBECTL  kubectl wrapper to use (default: kubectl-h4claw)
EOF
}

kubectl=${KUBECTL:-kubectl-h4claw}
namespace=website-dev
print=0
restart=0
for argument in "$@"; do
  case $argument in
    --print) print=1 ;;
    --restart-api) restart=1 ;;
    -h | --help) usage; exit 0 ;;
    *) printf 'unknown argument: %s\n\n' "$argument" >&2; usage >&2; exit 2 ;;
  esac
done

secret=$("$kubectl" -n "$namespace" get secret website-runtime \
  -o jsonpath='{.data.WEBSITE_TEST_RESET_SECRET}' | base64 -d)
# An empty jsonpath answer means the key is absent; anything but 64 lowercase hex is a link the
# API would refuse, so stop before opening a browser on it.
# Proof: replacing this test with `false` made the absent and uppercase cases of
# puni-website-dev-reset.test.sh print a reset link and exit 0.
if [[ ! $secret =~ ^[0-9a-f]{64}$ ]]; then
  echo "WEBSITE_TEST_RESET_SECRET in $namespace/website-runtime is missing or not 64 lowercase hex" >&2
  exit 1
fi

if ((restart)); then
  "$kubectl" -n "$namespace" rollout restart deploy/api
  "$kubectl" -n "$namespace" rollout status deploy/api --timeout=180s
fi

url="https://dev.request.puni.dev/#test-reset=$secret"
if ((print)); then
  printf '%s\n' "$url"
else
  xdg-open "$url" >/dev/null 2>&1
  echo "opened the reset link in the default browser; test in that browser"
fi
