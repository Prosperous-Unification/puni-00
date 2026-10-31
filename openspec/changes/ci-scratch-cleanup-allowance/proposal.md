## Why

The shared Bun scratch cleanup hook has a separate 30-second allowance, but the published observability checkpoint exhausted it after all named devsync cases passed. Its final cleanup took31.095 seconds and produced an unnamed hook failure. A copied actual-hook replay reproduced the signature with31 seconds of finite removal latency; the hosted filesystem cause remains unmeasured.

## What Changes

Give only the existing global scratch cleanup hook an explicit finite 60-second allowance. Preserve ordinary test budgets, job and phase limits, cleanup behavior and signal handling. Prove the allowance with the actual preload/remover and injected finite filesystem latency.

## Impact

Only shared test teardown changes. No application code, migrations, serialized formats, CI partitioning or activation architecture changes. Reverting this follow-up restores the prior30-second hook allowance. Keep default regression tests fast; record the31-second physical-removal proof separately.
