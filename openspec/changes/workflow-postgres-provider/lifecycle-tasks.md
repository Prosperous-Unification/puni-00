# PostgreSQL private lifecycle implementation

**Goal:** implement the private real-driver connection/transaction/disposal layer needed by the full second durable provider.

**Spec:** [Lifecycle design](lifecycle-design.md) and [provider delta specs](specs/workflow-postgres-store/spec.md).

## Global Constraints

- Bun and Nx only. No production deployment or operator-store migration.
- Current 26 RunStore/two ArtifactStore ports and existing SQLite implementation stay unchanged.
- Direct same-role writer/observer connections; no new service credential or blanket monitoring grant.
- Synchronously fence; reject queued calls; await admitted work/local disposal and independently observed writer quiescence. Unknown is not success.
- Prepared SELECT session marker and inspection are one command. Never infer absence after reconnection, missing visibility or query failure.
- Same-statement mutation lock/lookup and REPEATABLE READ writes are invalid. Writes lock then read in separate READ COMMITTED commands.
- Retain original and cleanup causes; finite deadlines do not prove underlying work cancelled. Unknown COMMIT stays unknown.
- Real disposable fixture and production-path negative controls; no full provider/conformance or production selection claim.
- Root owns Docker setup/cleanup and PR pushes. Workers do not spawn subagents or alter unrelated files; commits stage only owned task paths and use normal hooks.

## Task 1: Observe the exact writer set on one pinned read-only session

**Files:** create `apps/twilight-structure/twilight-dash/cli/src/runs/postgres/observer.ts`, `observer.db.test.ts`, `deadline.ts`, `deadline.test.ts`.

**Interfaces:**

```ts
import type { ReservedSQL } from 'bun';
export interface PostgresWriter {
  readonly pid: number;
  readonly startedAt: string;
  readonly databaseOid: string;
  readonly roleOid: string;
  readonly applicationName: string;
}
export function awaitCompletion<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T>;
export function readPostgresWriter(
  connection: ReservedSQL,
  applicationName: string,
  signal: AbortSignal,
): Promise<PostgresWriter>;
export function createPostgresObserver(
  connection: ReservedSQL,
  configuration: {
    readonly observerName: string;
    readonly writerName: string;
    readonly pollMilliseconds: number;
  },
  signal: AbortSignal,
): Promise<{
  register(writer: PostgresWriter, signal: AbortSignal): Promise<void>;
  waitForWriters(signal: AbortSignal): Promise<void>;
}>;
```

- [x] 1.1 Write deadline tests before implementation. A pending real promise rejected by an abort must preserve the abort cause; resolving the held promise afterward must not turn it into success. Removing the abort listener must fail the rejection assertion after the held promise is deliberately released, not merely hang the test.

```ts
const held = Promise.withResolvers<number>();
const abort = new AbortController();
const pending = awaitCompletion(held.promise, abort.signal);
abort.abort(new Error('fixture deadline'));
held.resolve(17);
await expect(pending).rejects.toThrow('fixture deadline');
```

- [x] 1.2 Write real-driver observer tests, then implement the fixed catalog reads, exact writer registration and session-bound prepared inspection. Generate a short safe marker internally; PREPARE/EXECUTE names and catalog SQL are private constants. The complete marker/inspection is one statement. No arbitrary SQL escapes the observer API.
- [x] 1.3 Demonstrate same-role visibility, idle writer presence, fresh disappearance after real close, unrelated same-role bundle exclusion and wrong-registration rejection. Break the marker/visibility/tagging dependency and observe the intended rejection. A lost/deallocated/replaced prepared probe cannot return false absence. Include parallel descendant coverage or conservatively reject ambiguous ownership; never filter only client/active backends.
- [x] 1.4 Run tests with the provided exclusively owned fixture, typecheck/lint/format relevant new paths, perform self-review and normal commit of only these four paths. Record exact red/green commands, results and R5 faults in the task report. No second-provider acceptance.

## Task 2: Own serialized transactions and bounded sticky disposal

**Files:** create `apps/twilight-structure/twilight-dash/cli/src/runs/postgres/session.ts`, `session.test.ts`, `session.db.test.ts`; consume Task1 observer/deadline exports unchanged unless a reviewed interface defect requires correction.

**Interfaces:**

```ts
import type { SQL, ReservedSQL } from 'bun';
export interface PostgresBudgets {
  readonly openMilliseconds: number;
  readonly operationMilliseconds: number;
  readonly closeMilliseconds: number;
  readonly statementMilliseconds: number;
  readonly lockMilliseconds: number;
  readonly pollMilliseconds: number;
}
export type PostgresClientFactory = (
  purpose: 'writer' | 'observer',
  applicationName: string,
) => SQL;
export function openPostgresSession(
  factory: PostgresClientFactory,
  budgets: PostgresBudgets,
): Promise<{
  write<T>(key: bigint, operation: (connection: ReservedSQL) => Promise<T>): Promise<T>;
  snapshot<T>(operation: (connection: ReservedSQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}>;
```

- [ ] 2.1 Validate explicit finite budgets before resource creation; reserve dedicated writer/observer connections, verify role/database/cookie and register the writer before admitting callbacks. Failed construction attempts both independent cleanups and reports uncertainty/errors without claiming resources gone. Test malformed budgets and real startup mismatch.
- [ ] 2.2 Write real-driver tests proving separate lock/lookup READ COMMITTED writes, coherent read-only REPEATABLE READ snapshots, real rollback, COMMIT-before-reply ordering and no automatic retry after connection/commit ambiguity. Implement only after the named assertions fail. Both operation and rollback errors remain visible; no new public refusal/replay journal.
- [ ] 2.3 Write tests for immediate close fence, queued-before-close rejection, admitted-operation drain, late callback prevention, real server writer wait after local close, deadline expiry and sticky observer/writer disposal failure. Implement ordered bounded close through the actual observer; a client-close-only mutation must fail the server-quiescence assertion.
- [ ] 2.4 Review and run the complete new private-layer suite against the same real fixture. Run relevant project typecheck/lint/format plus production-path negative controls with exact source restoration. Keep production `openStores` SQLite-only and all full-provider/transfer tasks open.

## Task 3: Review and publish the private component

- [ ] 3.1 Obtain task-scoped spec/quality reviews and a final whole-branch review; resolve all Critical/Important findings. Preserve exact normal commits, test/negative native streams and fixture cleanup evidence.
- [ ] 3.2 Update the OpenSpec design/tasks/evidence and WBS honestly; push all new work to the existing draft PR with a title/body matching its final private-lifecycle scope. CI and required exact-source gates remain separate acceptance before merge. No production selection, complete PostgreSQL provider, operator migration or production deployment.

Task 1 was approved after two review fix rounds at `0a1658be27912903d7321b9942ccfa0b609aa016`. The [observer publication record](evidence/postgres-observer-publication.md) records evidence and limits. Tasks 2–3 remain open; Task 1 does not establish session ownership or complete-provider acceptance.
