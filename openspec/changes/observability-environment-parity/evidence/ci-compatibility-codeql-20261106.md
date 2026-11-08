# Task117 CodeQL test amendment

Baseline published `9cbe4d2bbd4e228ddb2c45c3daaf3a2ffd73f3c6`. The actual hosted CodeQL check127680877741 reported `Incomplete URL substring sanitization` at `observability-preflight.discovery.test.ts:58:16–65`, on `(definitions as readonly string[]).includes(helm)`. Inspection confirmed that `definitions` is an array of exact Kubernetes resource names. Its elements feed the existing CRD selection/expectations; the production caller uses exact CRD kind/name equality before constructing the workload query. No URL validation or network trust decision occurs in this test expression.

Only `tools/tool-fleet/src/observability-preflight.discovery.test.ts` changed. One explicitly typed `Set<string>` of the discovered definition names now serves all four repeated definition-membership expressions through `.has`. Existing positive/negative scenarios and every assertion remain. No suppression, alert dismissal, workflow policy, production behavior or mirrored test was added. The other six Task117 fixture paths, sixteen frozen source identities, original `/tmp/puni-task117-evidence` campaign/index/proof/report artifacts, and production caller/fixture bytes remain unchanged.

The existing affected discovery file ran exactly once after this mechanical edit: **19pass/0fail/0skip,144assertions,3.825s**. This covers all eight discovered-API combinations, unknown/spoofed CRDs, discovered-but-unready APIs, all three native custom-API query failures, missing/malformed/unreadable CRD inventories and cutover receipt/controller negatives. Named ESLint, Prettier and scoped whitespace each exited0. No broader tests, new tests, Fleet typing, retained/native/service/admin operation, commit, push or CodeQL rerun was performed. Root owns review/publication and fresh hosted analysis. CI42153067413 was not canceled/restarted/rerun or inspected by this agent. Actual hosted CodeQL resolution remains unverified locally.

Separate amendment evidence is `/tmp/puni-task117-codeql`, with no original evidence index regeneration. Exact commands and timings are in the corresponding `.run.json` files:

```sh
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/observability-preflight.discovery.test.ts
bun x eslint tools/tool-fleet/src/observability-preflight.discovery.test.ts
bun x prettier --check tools/tool-fleet/src/observability-preflight.discovery.test.ts
git diff --check -- tools/tool-fleet/src/observability-preflight.discovery.test.ts
```

Frozen amended file: 7383B SHA256 `486883d69dbac907baad4f187da25ca726388b45edf11002a5f45ca4f184ca77`. `source.json` records the baseline hash, four membership calls, one typed Set, unchanged assertion/declaration counts and preserved source/evidence checks. `discovery.log` is1979B SHA256 `d44d3b20b20afc7da70f9d04c15c3c3cab200d60100fd7c2d6f69765c619a570`; `amendment.diff` contains the complete single-file edit.
