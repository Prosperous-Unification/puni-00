#!/usr/bin/env bash
# Proof: omitting -e let an injected first-file lint failure exit0 through Lefthook
# (hook-propagation-omitted.txt, 2026-10-17).
set -eu
# Proof: removing this guard made empty selected argv exit0 (hook-empty-guard-omitted.txt).
if [[ $# -eq 0 ]]; then
  printf 'move lint requires selected paths\n' >&2
  exit 64
fi
for path in "$@"; do
  printf '%s\n' "$path" >> /tmp/step-move-lint-invocations.txt
  bunx eslint "$path"
done
