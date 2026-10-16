#!/usr/bin/env bash
set -euo pipefail
checkout=${1:?isolated checkout required}
receipts=${2:?absolute receipt directory required}
mutation=${3:?mutation script path required}
cd "$checkout"
git diff --exit-code
mkdir -p "$receipts"
source_path="$checkout/apps/wbs/fe-01/src/components/wbs/column-resize.tsx"
cp "$source_path" "$receipts/column-resize.clean.tsx"
restore_source() { cp "$receipts/column-resize.clean.tsx" "$source_path"; }
trap restore_source EXIT
run_mounted() {
  (cd "$checkout/apps/wbs/fe-01" && TZ=UTC bunx vitest run src/components/wbs/column-resize.test.tsx --no-file-parallelism --maxWorkers=1)
}
run_mounted > "$receipts/mounted-positive.log" 2>&1
for fault in pointer-filter release-commit; do
  restore_source
  bun "$mutation" "$source_path" "$fault"
  if run_mounted > "$receipts/fault-$fault.log" 2>&1; then
    printf 'Fault unexpectedly passed: %s\n' "$fault" >&2
    exit 1
  else
    status=$?
    if [[ $status -ne 1 ]]; then
      printf 'Fault exited with an unexpected status: %s %s\n' "$fault" "$status" >&2
      exit "$status"
    fi
  fi
done
restore_source
run_mounted > "$receipts/mounted-restored.log" 2>&1
git diff --exit-code
git rev-parse HEAD HEAD^{tree} > "$receipts/source-identity.txt"
printf 'Mounted positives, both expected-negative exits, restoration and clean diff observed.\n'
