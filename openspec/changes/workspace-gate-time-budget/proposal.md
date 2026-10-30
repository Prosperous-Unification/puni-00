# Workspace gate time budget

## Problem

PR787 run40959508633 exhausted its90-minute workspace allowance twice. Attempt1 completed test/typecheck/build in76m28s, lint in8m58s and source lint in34.5s, then cancellation interrupted solver smoke. Attempt2 completed test/typecheck/build in80m32s and was cancelled during lint. Both required aggregates were nonpassing; retained logs show no failing-test markers, not a completed second lint verdict.

## Outcome

Give only gate_workspace a finite120-minute job timeout, allowing the existing required checks to finish. Align its existing production-entrypoint assertion and observe exact-head hosted CI plus the canonical host gate before release acceptance.120 is a chosen finite allowance, not an already measured completed duration.

## Non-goals

No check removal, command/scope/verdict change, parallelism change, other timeout change, Tool Wiki activation change, application/authentication implementation, R2 architecture merge or production deployment.

## Constraints

Preserve the current75-minute Twilight allowance and every other parsed workflow value. Use the existing policy test, not a new mirroring test. Retain all earlier60/90-minute evidence and both new failed attempts. The higher cap can cost up to30 additional hosted runner minutes per workspace job; expiry still cannot yield a passing gate.
