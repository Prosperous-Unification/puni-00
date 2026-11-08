# Bounded runtime observation transport — 2026-10-22

Base: `6255ae662b5a4ef334917b5c4bb37acc328ac720`, isolated clone
`/tmp/puni-dependency-cli`. Installed dependencies were reused through a symlink
to the source worktree's `node_modules`; no install or lockfile change occurred.

The backend advertisement is now a shared frozen DB-free value. The no-argument
capability executable emits that value with empty semantics. The exact decoded
runtime-capability parser rejects unknown protocol/version/role/semantics,
duplicates, missing keys and extra keys. JSON decoding remains the transport
caller's responsibility; no deployment consumer is wired by this slice.

The inspection executable accepts exactly `inspect`, requires explicit nonempty
`DB_PATH`, opens an existing read-only connection, delegates to the established
strict authority inspector and closes in `finally`. It reports ENABLED even
when there are no external edges. Missing authority is never converted to
DISABLED. This provides observations, not activation or participant proof.
Production external authoring remains dormant; tasks 10.1 and 10.2 remain open.

## Commands and observations

- `bun test libs/wbs/domain/contracts/src/dependency-runtime.test.ts apps/wbs/be-01/src/dependency-capabilities-cli.test.ts apps/wbs/be-01/src/dependency-activation-cli.db.test.ts --timeout=15000`: 70 pass, 0 fail, 118 assertions. See `final-tests.txt`.
- `bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts --timeout=15000`: 8 pass, 0 fail, 32 assertions. Its real health listener initially failed with sandbox EPERM; the same suite passed with a scoped sandbox escalation. See `startup-regression.txt`.
- `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0, no diagnostics. An earlier run caught index-signature environment access and a test role-union mismatch; both were corrected.
- Targeted ESLint over the eight changed/new TypeScript files: exit 0, no diagnostics, after generating the Nx project graph. Initial lint lacked a cached graph and therefore skipped module-boundary enforcement; that initial output is not the final lint evidence.
- Targeted Prettier and `openspec validate --all --json`: see the final verification record and attached output.

TDD red output is retained: the parser import initially failed because the
export was absent; the two inspection positives failed because the executable
was absent; capability execution failed before its executable existed. These
are implementation-start observations, not claims that absent executables
prove individual refusal guards.

## Watched R5 faults

`watched-faults.py.txt` records the substitutions and commands. Each final fault
was restored before verification. Logs retain observed test failures.

| Injected production fault                                                                                      | Observed failure                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Remove runtime protocol, version, role, exact-key, semantic or duplicate check separately                      | Corresponding malformed observation accepted; six separate parser mutations failed tests                   |
| Remove capability argument guard                                                                               | Capability argument subprocess exited 0                                                                    |
| Require DB_PATH in capability executable                                                                       | DB-free subprocess exited nonzero                                                                          |
| Require working-directory drizzle journal in capability executable                                             | Migration-free subprocess exited nonzero                                                                   |
| Advertise cross-project semantic support                                                                       | Exact empty-semantics assertion failed                                                                     |
| Remove inspection argument guard                                                                               | All four invalid argument subprocesses succeeded                                                           |
| Remove explicit DB_PATH guard                                                                                  | Required explicit diagnostic was lost for missing/empty/whitespace path                                    |
| Replace read-only connection with creating writable connection                                                 | Absent-database negative observed an invented file                                                         |
| Replace read-only connection with writable connection while preloading an inspector that executes CREATE TABLE | `forbidden_inspection_write` actually existed; table-absence assertion failed before diagnostic assertions |
| Replace strict inspection with constant DISABLED                                                               | All ten corruption subprocess negatives improperly succeeded                                               |

The corrected write proof checks actual schema effects before exit status or
error text. The corrected corruption fixture executes each SQL statement
separately: Bun/Drizzle's `run` executes one statement, so placing PRAGMA plus
UPDATE in one string had failed to install the intended UNKNOWN-state fault.
The strict-delegation fault was rerun against the corrected fixture.

Read-denial proof ran as uid 1000 with chmod 000, restored permissions and
confirmed unchanged database bytes. It does not claim chmod denial under root.
The read-only connection may create SQLite WAL coordination sidecars. Tests
compare the persistent main database bytes and explicitly check the attempted
write's schema effect; they do not promise a sidecar-free filesystem. Capability
execution does prove an empty working directory remains empty.

No h2/h4 host gate, full Nx gate, build, browser, CI secrets/migration lint,
Docker/Kubernetes rehearsal, participant inventory, activation, deployment,
client capability exposure, rollback admission or live verification ran here.
The observation parser has unit and subprocess capability-consumption coverage;
this is not evidence of deployment admission safety. Independent review and
integration remain with the parent lane.
