#!/usr/bin/env bash
set -euo pipefail

environment=${1-}
# Proof: accepting another environment reached fake SSH in the invalid-environment log command test.
case $environment in
  dev|prod) shift ;;
  *) printf 'Expected website environment dev or prod.\n' >&2; exit 64 ;;
esac

command="puni-website-$environment-logs"

usage() {
  printf 'Usage: %s [api|app|site] [-f|--follow]\n' "$command"
}

if [[ $# -eq 1 && ( $1 == -h || $1 == --help ) ]]; then
  usage
  printf '\nRead up to 100 lines from the last 30 minutes via the h4 SSH alias.\n'
  printf 'Choose api (default), app, or site.\n\n'
  printf '  -f, --follow  Stream new log lines until stopped.\n'
  printf '  -h, --help    Show this help.\n\n'
  printf 'Example: bin/%s site --follow\n' "$command"
  exit 0
fi

workload=api
case ${1-} in
  api|app|site) workload=$1; shift ;;
esac

follow=()
case ${1-} in
  -f|--follow) follow=(--follow); shift ;;
esac

# Proof: removing this check reached fake SSH in the unsupported-argument log command test.
if (($#)); then
  usage >&2
  exit 64
fi

exec ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes h4 \
  k3s kubectl -n "website-$environment" logs "deployment/$workload" \
  --since=30m --tail=100 "${follow[@]}"
