#!/usr/bin/env bash
set -euo pipefail
# Proof: hook-wrapper-proof missing-paths exits 64 before invoking ESLint.
if (($# == 0)); then
  echo 'lint wrapper requires hook-expanded paths' >&2
  exit 64
fi
printf '%s\0' "$@" > .git/lint-staged-serial.argv
# Proof: injected bunx exit 23 stops before the third path in hook-wrapper-proof.
for source in "$@"; do
  bunx eslint "$source"
done
