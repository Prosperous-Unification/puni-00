# `@wbs/validation/fixtures`

The single source of test fixtures across the workspace.

```ts
import { injectedClock, makeFrame, makeTestDb } from '@wbs/validation/fixtures';
```

## Conventions

The full list is D20 in
[the scaffold design](../../../../../../openspec/changes/scaffold-tech-setup/design.md#d20-test-strategy).

1. Factories, never shared mutable fixtures. `makeX({ override })` pattern.
2. Deterministic clock + RNG — `injectedClock(startMs)` and seeded `fast-check`.
3. No network, no filesystem, no wall clock in unit tests.
4. One assertion concept per test.
5. Test names state invariants, not actions.
