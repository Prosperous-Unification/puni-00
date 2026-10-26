## Why

The shared Bun scratch preload inherits each target's ordinary test timeout. Synchronous recursive cleanup can exceed a 10-second target budget after its tests pass, producing an unnamed teardown failure.

## What Changes

Give only the existing global scratch cleanup hook an explicit finite 30-second allowance. Preserve ordinary test budgets, job and phase limits, cleanup behavior and signal handling. Prove the allowance with the actual preload/remover and injected finite filesystem latency.

## Impact

Only shared test teardown changes. No application code, migrations, serialized formats, CI partitioning or activation architecture changes. Reverting the small source change restores the inherited hook deadline.
