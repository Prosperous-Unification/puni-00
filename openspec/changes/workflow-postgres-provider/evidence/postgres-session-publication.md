# Private PostgreSQL transaction owner

Task 2 is independently approved at `61277840be4c9c4e0498e22dca77f922894c9b97`. It supplies private serialized transactions, coherent read snapshots and bounded sticky disposal through the approved observer. The production selector still has no PostgreSQL adapter. [The lifecycle plan](../lifecycle-tasks.md) separates this prerequisite from complete-provider acceptance.

Writes start READ COMMITTED, await a separate advisory-lock command, then run trusted adapter work. Snapshots use read-only REPEATABLE READ. Callback values are returned only after awaited COMMIT with validated native COMMIT metadata. Real PostgreSQL returned a ROLLBACK command tag after a callback caught a SQL error; the implementation rejects that result and missing/unreadable metadata. Ambiguous outcomes fence the owner without retrying or inferring nonacceptance.

Caller deadlines start at enqueue; actual admitted work stays tracked independently. Close fences immediately, rejects queued callbacks, drains actual settlement, independently disposes writer reservation/pool, observes server writer absence, then independently disposes observer reservation/pool under one deadline. A caller timeout does not certify cancellation. Late rollback cleanup failure observed before close completion preserves original and rollback causes through sticky close; already-reported operation failures retain their separate operation outcome. Direct same-role fresh pools and trusted callbacks remain required: no detached work, retained connection use, transaction control, identity changes or autonomous/two-phase writes.

## Retained evidence

The final configured four-source-file suite recorded **53 pass / 0 fail**, including **30 new session tests** and 23 observer/deadline tests. Project lint, final covered lint, uncached project typecheck and formatting passed with Bun 1.4.4, native TypeScript 7.0.2 and PostgreSQL 18.6. New verification runners normalized conflicting color settings; old warning output remains preserved. Normal scoped commit hooks passed without bypass.

The initial27 credited controls and fix controls S28/S29/S30c have native intended assertion failures and exact source restoration. Surviving/masked earlier controls, failed lint attempts, accidentally collected generated tests and all original review findings remain explicitly uncredited or superseded in the archived report. The final counted suite names only the four exact source paths. Task 2 used Bun throughout; the separate historical Task 1 Python deviation is not erased.

The [compressed packet](postgres-session-20261104.json.gz) preserves 412 original files, 90 hash-verified native command records, both task reviews, both diffs, the full implementation/fix report and all retained attempts. [The manifest](postgres-session-manifest.json) binds lengths, hashes and three exact committed source files. Each JSON entry is base64 with byte length and SHA-256; verify decoded bytes before inspecting. Never execute archived runners to inspect evidence.

## Limits and follow-up

One earlier combined run recorded 52 pass / 1 fail in the unchanged observer parallel-worker test. Focused recheck and later complete runs passed, but the original raw catalog snapshot was absent, so its cancellation-transition cause is unproven. Task 3 separately corrects fixture staging under the unchanged fail-closed policy; the later 53 pass observation does not erase the failure.

This checkpoint proves no complete 26+2 PostgreSQL provider, schema/durability admission, shared semantic conformance, transfer, selector enablement, whole-branch/host gate, operator migration or production deployment. Unconfigured service profiles visibly skip database cases. Root retains exclusively owned fixture cleanup and broader integration. Ordinary execution work and provider adoption remain separate from this private component.
