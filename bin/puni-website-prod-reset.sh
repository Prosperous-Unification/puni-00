#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: puni-website-prod-reset [--print] [-h|--help]

Open the production chat reset for the current browser. Sign in at
https://request.puni.dev/operator first, then confirm the reset in the browser.
The previous chat remains in storage and the public intake opens with a fresh
conversation allowance.

  --print     Print the reset URL for use in another browser.
  -h, --help  Show this help.
HELP
}

url='https://request.puni.dev/#reset-chat'
case ${1:-} in
  --print) action=print ;;
  -h|--help) action=help ;;
  '') action=open ;;
  *) action=invalid ;;
esac

# Proof: treating unknown options as open made the invalid-option test launch the browser.
if (( $# > 1 )) || [[ $action == invalid ]]; then
  usage >&2
  exit 2
fi

case $action in
  help) usage ;;
  print) printf '%s\n' "$url" ;;
  open) xdg-open "$url" ;;
esac
