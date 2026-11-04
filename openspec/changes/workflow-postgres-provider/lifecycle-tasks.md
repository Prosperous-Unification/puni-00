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

- [x] 2.1 Validate explicit finite budgets before resource creation; reserve dedicated writer/observer connections, verify role/database/cookie and register the writer before admitting callbacks. Failed construction attempts both independent cleanups and reports uncertainty/errors without claiming resources gone. Test malformed budgets and real startup mismatch.
- [x] 2.2 Write real-driver tests proving separate lock/lookup READ COMMITTED writes, coherent read-only REPEATABLE READ snapshots, real rollback, COMMIT-before-reply ordering and no automatic retry after connection/commit ambiguity. Implement only after the named assertions fail. Both operation and rollback errors remain visible; no new public refusal/replay journal.
- [x] 2.3 Write tests for immediate close fence, queued-before-close rejection, admitted-operation drain, late callback prevention, real server writer wait after local close, deadline expiry and sticky observer/writer disposal failure. Implement ordered bounded close through the actual observer; a client-close-only mutation must fail the server-quiescence assertion.
- [x] 2.4 Review and run the complete new private-layer suite against the same real fixture. Run relevant project typecheck/lint/format plus production-path negative controls with exact source restoration. Keep production `openStores` SQLite-only and all full-provider/transfer tasks open.

## Task 3: Make parallel-fixture observation phases explicit

**Files:** modify only `apps/twilight-structure/twilight-dash/cli/src/runs/postgres/observer.db.test.ts`. Production observer/deadline/session modules and interfaces stay unchanged. This corrects an existing fixture assumption under the approved fail-closed protocol, not that protocol.

- [x] 3.1 Preserve the original recorded full-suite failure and successful rechecks as observations. The cancellation-transition cause remains unproven because the original raw catalog snapshot was not retained. Read the root diagnosis before changing the fixture; do not describe a rerun as a fix.
- [x] 3.2 In the shared real-parallel-worker helper, capture exact worker PID and backend-start epoch-text identities at readiness. Keep explicit visibility validation and bounded polling. After the original no-premature-success assertion, end the live observer wait with an explicit abort and assert the exact abort cause before beginning native cancellation. Preserve O9's pending assertion and O10's explicit null-link rejection.
- [x] 3.3 Cancel the actual writer query, await its native rejection, then close the writer. Through the continuously reserved administrator connection, positively await disappearance of every captured worker identity under a finite 2000ms bound. Read matching PIDs without filtering by leader PID, cookie, backend type or state; missing required identity visibility throws. A reused PID with a different full start identity is distinct. A leader-only or cookie-only count is not an absence proof. Restore the original complete prepared probe and run a new fresh wait on the SAME pinned observer after the barrier.
- [x] 3.4 Run the focused real fixture case and the complete private four-file source suite. Repeat only O9/O10 production-path controls covering this changed fixture; require native intended assertions and exact production source restoration. Keep all older controls/failed attempts unchanged. Run relevant scoped lint, project typecheck and format, self-review, then normal commit of only the assigned test file. No Docker/services/global SQL configuration, pushes, main integration or production change.

## Task 4: Review and publish the private component

- [ ] 4.1 Obtain task-scoped spec/quality reviews and a final whole-branch review; resolve all Critical/Important findings. Preserve exact normal commits, test/negative native streams and fixture cleanup evidence.
- [ ] 4.2 Update the OpenSpec design/tasks/evidence and WBS honestly; push all new work to the existing draft PR with a title/body matching its final private-lifecycle scope. CI and required exact-source gates remain separate acceptance before merge. No production selection, complete PostgreSQL provider, operator migration or production deployment.

Task 1 was approved after two review fix rounds at `0a1658be27912903d7321b9942ccfa0b609aa016`. The [observer publication record](evidence/postgres-observer-publication.md) records evidence and limits. Task1 alone does not establish session ownership or complete-provider acceptance; the following accepted checkpoints record the later work.

Task 2 was independently approved after late-rollback cause retention at `61277840be4c9c4e0498e22dca77f922894c9b97`; final recorded private suite53pass,30new session cases, with original observer intermittency retained. Task3 resolves fixture staging before whole-branch acceptance.

Task3 was independently approved at `bb464253b8ad711b999907700a54d0ee3033f234`: exact54pass suite, O9/O10 production negatives and F3 fixture negative, unchanged production hashes. Original failure cause remains unproven. Task4 whole-branch acceptance and complete-provider tasks remain separate.
