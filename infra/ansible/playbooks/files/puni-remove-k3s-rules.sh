#!/usr/bin/env bash
set -euo pipefail
case "${1-}" in
  iptables | ip6tables) family=$1 ;;
  *)
    echo "usage: puni-remove-k3s-rules.sh iptables|ip6tables" >&2
    exit 64
    ;;
esac
pattern='KUBE-|CNI-|FLANNEL|flannel'
rules=$("${family}-save")
if grep --quiet --extended-regexp "$pattern" <<<"$rules"; then
  grep --invert-match --extended-regexp "$pattern" <<<"$rules" | "${family}-restore"
  echo changed
fi
