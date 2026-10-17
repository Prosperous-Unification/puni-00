#!/usr/bin/env bash
# Proof: removing -e made the injected first-child failure report hook success (serial-hook-propagation-omitted.txt, 2026-10-17).
set -eu
for path in "$@"; do
  printf '%s\n' "$path" >> /tmp/export-fence-lint-invocations.txt
  bunx eslint "$path"
done
