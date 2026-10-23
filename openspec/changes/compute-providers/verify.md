## Verification record

Drafted 2026-10-22 as an OpenSpec proposal only; nothing is implemented. O1 to O5 in
design.md are Dany's owner decisions; P1 to P14 are assumed until he reads them. Sources read
on 2026-10-22: `wbs-resources` (proposal, design R1 to R8, `resource-directory` and
`resource-occupancy` specs, tasks, verify slice 5), `wbs-machine-credentials` on branch
`plan/wbs-machine-credentials` at `0dd0c4710` (design A1 to A24, `machine-credentials` spec,
tasks slice 1), `wbs-team-claims` (D1 to D8, `fleet-credentials` spec), the migrations
`20261020120000_add_resources`, `20261020130000_add_claim_occupancy` and
`20261012090000_add_enterprise_sso_records`, `commands/definitions.ts` (`createResource`,
`patchResource`, `deleteResource`, `setResourceCapacity`), `resource-shapes.ts`,
`refusal.ts`, `ports/organization-audit.ts`, the Dash README and `src/` layout,
`docs/twilight-structure/names.md` and glossary, `docs/infra/gate-hosts.md`,
`docs/infra/enroll-h4claw-h3mon.md` (h4claw 8 CPUs, 15,602 MiB; h2puni 8 vCPU, 15 GB usable),
`discovery-ssh-transport` and `f9-local-process-observation` proposals, Claire's notes
`notes/resource-claim-release-design-2026-10-17.md` and
`notes/wbs-resource-claiming-breakdown.md`, `openspec/changes/twilight-control-plane/design.md`
§Admission and §Planning, knowledge and client portability.

Term collisions checked in `CONTEXT.md` and `docs/twilight-structure/CONTEXT.md`:
**provider** alone is avoided for Adapter and Ref family and is the identity provider in the
auth terms, so the term is **Compute provider** (P1); **Capacity pool** and **Lease** stay
Dash's runtime terms and are not reused for the report; **Worker provisioner** is the Dash
actor that places an attempt on a provider and is not renamed; **Occupancy** is untouched.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before any slice is called done

- Slice 1: the rollback guard refuses over one reference; the browser-session, delegation and
  `person`-pinned machine cases are each refused `not_an_agent_principal` and store nothing;
  B's key against A's instance is `404 unknown_provider` with no instance named; the same body
  twice is one stored row; the older `observedAt` is `report_superseded`; the schedule hash and
  the claim decision are byte-identical with and without a stored report; the export holds no
  instance id; each `Proof:` names its watched negative.
- Slice 2: the SSH adapter answers `unreachable` for a closed port and throws for a missing
  `MemTotal`; no `Date.now` in `src/compute`; the reporter exits on `401` and after three
  `report_superseded`; the credential appears in no output; the first stored reports for
  h2puni and h4claw are quoted from dev with their `observedAt` and `reportedBy`.
- Slice 3: the labelled-containers fixture over-reports with the label filter removed and
  does not with it restored.
- Slice 4: a `puni_pool` and a `kubernetes` instance each register in WBS and each refuse to
  start in Dash with their named refusal before any dial.
- Slice 5: the four report states and the stale boundary render; a missing report never
  renders as a number; adopt writes exactly one `setResourceCapacity` and undo restores.

## Slices

### Slice 1: WBS provider reference and capacity report (2026-10-22)

Branch `feat/compute-providers-1` on `plan/compute-providers` merged with `main` at
`75585eebd` (machine credentials). Implemented tasks 1.1 to 1.5.

What landed:

- Migrations `20261022140000_add_resource_provider` (`compute_provider`,
  `resource.provider_id`, `resource_capacity_report`; additive, guarded `down.sql`) and
  `20261022140100_widen_organization_audit_compute_providers` (one compatible rebuild of
  `organization_audit` admitting `compute_provider_registered|updated|removed` and subject kind
  `compute_provider`; issue #632's trigger allow-list has not landed, and moving the vocabulary
  into triggers would need this same rebuild to drop the CHECK first).
- `@wbs/domain` `compute-provider.ts`: `decideCapacityReport`, `capacityReportStateOf`,
  `compareCapacity`; `@wbs/core` ports `compute-providers.ts`,
  `DirectoryStore.setResourceProvider`; SQLite `ComputeProviderRepository`; routes
  `GET|POST /api/organization/compute-providers`, `PATCH|DELETE …/:id` (`?cascade=true`),
  `PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report`;
  `patchResource.patch.providerId`; the resources read carries `providerId`, `report` and
  `measurement { declared, measured, measuredAt, state }`.
- MCP: the three new path families are excluded from the generated tools.

R5 proofs, each fault injected, the named test watched failing, the fault reverted:

| Check                                                | Injected fault                                                  | Observed                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| pinned person must be `agent` (domain)               | check removed                                                   | `refuses a key pinned to a person of kind person` failed                        |
| `observedAt` skew bound                              | check removed                                                   | `refuses an observedAt beyond the skew tolerance…` failed                       |
| instance organization (domain, O4)                   | comparison dropped                                              | `answers another organization's instance unknown_provider…` failed              |
| `provider_mismatch`                                  | check removed                                                   | `refuses a resource that names another instance…` failed                        |
| latest wins                                          | superseded turned into store                                    | superseded case and the fast-check property both failed                         |
| stale at 3 × cadence                                 | `>` made `>=`                                                   | `marks stale only past three cadences` failed                                   |
| rollback guard of `add_resource_provider`            | trigger `WHEN 0`                                                | `refuses rollback over one referencing resource` failed (rollback succeeded)    |
| report outcome CHECK                                 | `CHECK (1 OR …)`                                                | `refuses a report whose columns contradict its outcome` failed                  |
| one instance name per organization                   | unique index made plain                                         | `keeps one instance name per organization` failed                               |
| audit rollback guard                                 | filter `WHERE 0`                                                | `refuses rollback over one compute provider audit row` failed                   |
| migration lint accepts the rebuild                   | `CHECK (violations = 0)` → `CHECK (1)`                          | `accepts the compute provider audit rebuild` failed                             |
| admin only                                           | members admitted                                                | member's list answered 200 instead of 403                                       |
| `name_taken`                                         | check removed                                                   | third `h4claw` answered 500 instead of 409                                      |
| organization predicate on instance lookup            | predicate dropped                                               | Dany's patch renamed B's instance (200)                                         |
| `in_use` unless cascade                              | refusal removed                                                 | delete answered 204 without cascade                                             |
| audit row in the act's transaction                   | append failure swallowed                                        | 201 instead of 500                                                              |
| secret-shaped name or locator                        | route check removed                                             | 500 instead of 400                                                              |
| machine principal only on the report                 | predicate removed                                               | session answered 500 instead of 403                                             |
| reference names an existing instance                 | check removed                                                   | 500 instead of 404 `unknown_provider`                                           |
| reference names the caller's organization's instance | check removed                                                   | B's instance stored on A's resource (200)                                       |
| resources read carries the provider columns          | `withProviderReadings` dropped                                  | three read cases found no `providerId`                                          |
| boot wires the store                                 | binding omitted                                                 | `boot did not wire compute providers`                                           |
| `resourceCapacityReport` audit-column exemption      | `auditColumns()` injected                                       | `exempts only tables that carry no audit columns` failed                        |
| MCP exclusions                                       | admin entries removed / report entry removed                    | the four admin tools / the `putApiCompute-providers…` tool exposed              |
| P4: a report never plans                             | SQLite capacity read prefers `capacity_units`                   | schedule hash moved; with the read asserts removed the 12 GB claim answered 409 |
| P4: export never carries the reference               | resource read selects `provider_id`, document rows spread whole | the export after the reference differed from before                             |
| PATCH refuses an empty patch (review S2-4)           | check removed                                                   | `{}` answered 200 instead of 400                                                |
| PATCH refuses a secret-shaped name or locator (S2-4) | check removed                                                   | 500 instead of 400                                                              |
| `in_use` names the resource's instance (S2-3)        | usage read answers null                                         | `counts.providerId` read null                                                   |
| `update`'s `name_taken`                              | check removed                                                   | 500 instead of 409                                                              |
| a moved reference drops the old report               | deletion removed                                                | one report kept                                                                 |
| cascade clears the references                        | clearing removed                                                | cascade answered 500 (foreign key) instead of 204                               |

Unverified or not done in slice 1:

- The task 1.3 race fault line: one process's write gate serializes two reporters, so no
  in-process test interleaves them; the compare-and-replace runs in one `BEGIN IMMEDIATE`
  transaction by construction only.
- The instance store has no memory twin (the memory composition holds no instance,
  `NO_COMPUTE_PROVIDERS`); only `setResourceProvider` is in the conformance suite.
- The adopt action (P7) is slice 5; nothing adopts a measurement.
- `browser-lifecycle.mounted-process.db.test.ts` `mounted worker protocol buffers…` fails
  here and on `main` at `e2ae536b2` alike (worker exit 143 under a 5 s timeout); unrelated.

Commands, run 2026-10-22 in `/home/df/wd/puni/wt-compute-providers-1` with `env -u CLAUDECODE`:

- `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-conformance,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-be-01,wbs-fe-01 --skip-nx-cache`: exit 0.
- `bunx nx run wbs-be-01:test --skip-nx-cache`: exit 0, 3249 pass, 0 fail.
- `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance,tool-git-hooks --skip-nx-cache`: each succeeded; `wbs-mcp-01:test` succeeded after its two shape-document fixtures gained the new paths.
- `bunx nx run-many -t lint -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-conformance,wbs-be-01,wbs-mcp-01,wbs-fe-01,tool-git-hooks --skip-nx-cache`: each succeeded (fe-01 after one `no-fallthrough` fix, rerun alone).
- `bunx nx run tool-devsync:test --skip-nx-cache` (full): exit 0, 894 pass, 0 fail.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts $(git ls-files '*.sql')`: exit 0.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`: exit 0; no new file lies under a module index (only `libs/wbs/adapters/store-memory/src/README.md` reports review debt, unchanged).
- `bunx openspec validate --all --json`: 268 of 268 passed.
- fe-01 changed only in `plan-refusal.ts` (three refusal codes the contract now carries); `vitest run src/components/wbs/attempt-actions.test.tsx`: 7 pass. The full fe-01 suite was not run.

### Slice 1 review (Fable, 2026-10-22, PR #651)

Verdict "merge as is". Closed on the same PR:

- S2-4: the PATCH route's empty-patch and secret-shaped checks gained a production-path negative
  each (rows above).
- S2-3: the directory usage carries the reference: a `deleteResource` refused `in_use` names the
  instance in `counts.providerId` (null when none; optional on the wire for an outgoing be-01).
  The `resource-directory` delta spec says where.
- S2-2: design P6 and task 1.4 now say the report route checks the machine principal in its
  handler, not through a new policy kind. The `compute-provider` delta spec states
  `measurement { declared, measured, measuredAt, state }` and that a same-body report from a
  different reporter at the stored `observedAt` is `409 report_superseded` (the sender is part of
  the identity of a report; the first report of an instant stands).
- S3: tasks 1.2 and 1.3 reworded to what shipped; `Proof:` comments added beside `update`'s
  `name_taken`, `setResourceProvider`'s report deletion and `remove`'s cascade clearing (rows
  above); be-01 composes one `ComputeProviderRepository` for both ports
  (`computeProvidersOver`).

Recorded, not changed:

- S2-1, forward risk: the limits plan also rebuilds `organization_audit`
  (`20261022130100`). Whichever rebuild lands second, when this plan rebases on `main` after the
  limits plan, its CHECK lists must be a superset of both vocabularies and its `down.sql` must
  restore the earlier plan's table exactly.
- S3: `decideCapacityReport` answers `personKind: 'person'` as a literal, correct while
  `PERSON_KINDS` has two members; `withProviderReadings` throws (500) if a listed resource is
  deleted between the planned read and the readings; the legacy `patchResource` path announces
  twice when it sets a reference and renames; fe-01 `plan-refusal.ts` passes the three new codes
  through unrendered, and their copy is slice 5's.

### Main re-merge (2026-10-22)

`origin/main` 33685ec48 (organization limits, `20261022130000` and `20261022130100`) merged into
this plan; S2-1 above is resolved here. Ledgers and rollback lists carry both plans in timestamp
order (… `120000`, `130000`, `130100`, `140000`, `140100`); vocabulary lists append the compute
provider members after the limits ones.

- `20261022140100_widen_organization_audit_compute_providers/migration.sql` now carries the
  `130100` vocabulary whole (`wbs-organization-limits` design L13: the second lander carries the
  first's): actions are main's `110000` set, `organization_limits_changed` and the three
  `compute_provider_*` acts; subject kinds are main's set, `organization_limits` and
  `compute_provider`.
- Its `down.sql` restores the `130100` table instead of the `110000` one, so a rollback keeps the
  limits CLI's rows and admits its writes; the refusal still guards only compute-provider rows.
  `resource-provider-migration.db.test.ts` compares the `sqlite_master` text of the table, its
  indexes and triggers after the rollback with a store migrated only through `130100`.
- `organization-limits-audit-migration.db.test.ts` expects the two compute-provider migrations to
  reverse before `130100`.
- No spawn fixture or harness this plan touched boots be-01 from an env file; every `bootBe01`
  call in `boot.db.test.ts` and `organization-harness.ts` already passes
  `TEST_ORGANIZATION_DEFAULT_LIMITS` after the merge (typecheck of the 13 projects is the check).

| Fault injected (watched 2026-10-22)                                                | Observed failing test                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization_limits_changed` dropped from the forward action CHECK                | `admits the three new actions and the kind, …` and `rolls back over outgoing-release rows, keeping them and the organization limits vocabulary` (`CHECK constraint failed: action`) |
| `organization_limits_changed` dropped from the restored action CHECK in `down.sql` | `restores the table, index and triggers the organization limits rebuild left, byte for byte` (schema text differs) and the blue/green rollback test                                 |

Commands run on the merged tree (2026-10-22, `env -u CLAUDECODE`):

- 13-project `typecheck` + `typecheck:module`, `--skip-nx-cache`: succeeded.
- `wbs-store-sqlite:test`: 1821 pass, 0 fail (after adding the compute pair to
  `organization-limits-migration.db.test.ts`).
- `wbs-be-01:test`: 3334 pass, 3 skip, 0 fail.
- Burokrat `check-indexes working . HEAD`: exit 0. Migration lint on `130000`, `130100`,
  `140000`, `140100` (`migration.sql` and `down.sql`): exit 0; `migration-lint.test.ts` 23 pass.
- `bunx openspec validate --all --json`: 269 of 269.
- NOT run to completion: the full `tool-devsync:test`; the harness stopped it when the laptop
  ran out of memory. CI on PR #658 is the first full run; owed locally or on a gate before the
  plan merges to main.

Review (Fable, 2026-10-22, PR #658): the merge is a clean union (every conflict-free file equals
the automatic three-way result; the four conflicted source files carry exactly both sides'
hunks), the `140100` restore body is byte-identical to `130100`'s modulo the TEMP guard names,
and the byte-for-byte test fails on a one-token trigger drift and on a dropped index. Recorded:

- The `140100/migration.sql` hash changed in this merge, and rollback refuses a migration whose
  on-disk hash differs from the applied one. No database ever applied the pre-merge `140100`:
  slice 1 lived only on its feature branch and this plan branch, dev deploys `main` only, and
  dev's ledger tail on 2026-10-22 was `20261022130100_widen_organization_audit_organization_limits`.
- Blue/green read exposure, pre-existing for every audit widening: the outgoing be-01's audit
  reader (`organization-audit-log.ts`) throws on a row whose action or kind it does not know, so
  a `compute_provider_*` row written by the incoming release makes the outgoing release's audit
  list read fail until the swap completes. Writes are unaffected in both directions. Belongs with
  issue #632.

### Slice 2: Dash provider port, `ssh_host` adapter, `report-capacity` (2026-10-22)

Branch `feat/compute-providers-2` from `chore/compute-providers-merge-main` at `8c8e96363`.
Implemented tasks 2.1 to 2.3; task 2.4 (operator steps, first stored reports from dev) is open.

What landed:

- `apps/twilight-structure/twilight-dash/cli/src/compute/`: `provider.ts` (the P8 port, plus
  `onRunChange` for the after-run tick), `configuration.ts` (`loadReporterConfiguration`, the
  refusals, `WbsCredential`), `ssh-host.ts` (the adapter), `report-capacity.ts` (the loop and
  the command), wired into `runDash` as `report-capacity`.
- `tools/tool-fleet/src/ssh-transport.ts` gains `renderRemoteCommandArguments` (`-F none`, the
  strict options, the jump's `ProxyCommand`, `ConnectTimeout`, `--`); Dash reaches it and
  `readSshTransport` only through `@tools/fleet-ssh-transport` (`ssh-transport-facade.ts`),
  allowed for `compute/**` alone in `eslint.product.mjs`.
- Dash CLI README section `report-capacity` (configuration shape and outcomes);
  `docs/infra/gate-hosts.md` points at it and at task 2.4.

Assumed in this slice (each overrulable):

- The configuration names the credential inline (`credential`, a `wbs_mk_` key only; no OIDC
  token source) and reuses fleet discovery's transport file per instance (`sshTransportFile`).
- In-gate SSH cases run against a fixture `ssh` client (`compute/testing/ssh-fixture.ts`), not an
  sshd: no sshd ships on the laptop or in CI, and the transport has no non-default port. The
  real client against a real sshd is the rehearsal below.
- `cpu_cores` usage is the one-minute load floored and capped at the core count; `agent_slots`
  dials `true` so an unreachable host reports `unreachable`, and its usage counts the runs this
  process started (0 for the reporter today).
- `name_unresolved` and `no_route` join the four P8 transport faults as `unreachable`.
- `docker` and `kubernetes` are refused `provider_not_implemented` until slices 3 and 4.
- Any `4xx` or redirect ends the loop (P10 names `401`, `403`, `404`, `409 provider_mismatch`;
  `400 invalid_body` and `observedAt_in_future` are treated the same). `5xx` and a transport
  fault to WBS retry once on the next tick, per binding, then exit `wbs_unavailable`.
- `wbsOrigin` must be `https:` or loopback `http:`.

R5 proofs, each fault injected into production source, the named test watched failing, the
source restored:

| Check                                       | Injected fault                                            | Observed failing test                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| unparseable answer throws (2.2)             | parse error caught and answered `unreachable`             | `throws for /proc/meminfo without MemTotal` and `throws for an unparseable df answer` (promise resolved)                           |
| `401` and every other refusal exit (2.3)    | refusal turned into a logged `break`                      | `exits on 401 and sends nothing further` (`test budget: the loop kept going`), the five `exits at once` cases, the entrypoint case |
| credential never echoed                     | `parseSecretsOrThrow` replaced by `parseOrThrow`          | `never echoes a malformed credential or a well-formed one` (summary quoted the key)                                                |
| owner-only configuration                    | mode and owner check skipped                              | `refuses a group- or world-readable configuration credential_not_owner_only`                                                       |
| absent distinct from unreadable             | `ENOENT` branch never taken                               | `refuses an absent configuration config_absent` (received `config_unreadable`)                                                     |
| plain HTTP only on loopback                 | protocol check off                                        | `refuses a plain-HTTP origin that is not loopback`                                                                                 |
| `puni_pool` refused by name                 | the pool branch never taken                               | `refuses a pool instance provider_kind_not_available before any adapter opens`                                                     |
| measures checked before opening             | `unsupported` check off                                   | `refuses a measure the adapter lacks unsupported_measure before opening it`                                                        |
| no `Date.now` in `src/compute`              | `Date.now()` appended to `compute/report-capacity.ts`     | `only clock.ts reads the wall clock` (`+ "compute/report-capacity.ts"`)                                                            |
| remote-command host cannot be an ssh option | refusal removed in `renderRemoteCommandArguments`         | `refuses a command host that ssh could read as an option`                                                                          |
| the cadence sleep wakes on a run change     | the abort listener dropped from `sleepUnlessInterrupted`  | `resolves when the interrupt aborts, long before the timer` (timed out)                                                            |
| compute reaches only the transport facade   | override widened to `^@tools/fleet`; override scoped away | `Dash compute reaches only the SSH transport facade` at the exact allow-list assertion, both times                                 |

Rehearsal against a real sshd (2026-10-22, scratch scripts outside the repository): two
disposable `alpine:3` containers, one running OpenSSH (`172.17.0.3`, user `puni1`, the key only
in a throwaway `ssh-agent`), one with nothing on port 22 (`172.17.0.4`); `/usr/bin/ssh`, the
production `sshHostAdapter` and `readSshTransport` with an owner-only `known_hosts`. Both
containers and the agent were removed afterwards.

| Case                                           | Result                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_gib`                                   | `measured`, `capacityUnits: 30`, `usageUnits: 29`, evidence `MemTotal: 32449024 kB; MemAvailable: 1608956 kB`                                                                |
| `disk_gib /tmp`, `cpu_cores`, `agent_slots: 4` | `measured` 459/352, 24/24 (load 33.29 capped), 4/0                                                                                                                           |
| `disk_gib /absent`                             | threw `df -kP -- '/absent' on 172.17.0.3 exited 1: df: /absent: can't find mount point`                                                                                      |
| `run uname -n`                                 | `{"exitCode":0,"stdout":"5269ec277ab9\n"}` (the container's host name)                                                                                                       |
| closed port                                    | `unreachable`, `ssh connection_refused: ssh: connect to host 172.17.0.4 port 22: Connection refused`                                                                         |
| `known_hosts` pinning another key              | `unreachable`, `ssh host_key_mismatch: No ED25519 host key is known for 172.17.0.3 and you have requested strict checking.`                                                  |
| the whole command, fake WBS on loopback        | four `PUT`s with the configured bearer; the fourth answered `401`; exit 1, `error: refused: instance h4claw resource slots: HTTP 401 unknown_identity`; the key in no output |

The first real run showed ssh ending its diagnostics with `\r\n`; the adapter now trims the
line, and the fixture's refusals carry `\r\n`.

Not run or not verified:

- Task 2.4: no instance is registered on dev and no report is stored there; the first stored
  reports for h2puni and h4claw are owed with it.
- A `MemTotal`-less or nonsense `df` from a real host: fixture only.
- The `timeout` and `authentication_failed` causes: classified from ssh's diagnostics, not
  observed against a real host here.
- SIGTERM: the reporter holds no state to flush and ends with the process; no handler is
  installed.

Commands, run 2026-10-22 in `/home/df/wd/puni/wt-compute-providers-2` with `env -u CLAUDECODE`:

- `bunx nx run-many -t lint typecheck -p twilight-dash tool-fleet --skip-nx-cache --parallel=1`:
  succeeded (4 tasks).
- `bunx nx run twilight-dash:test --skip-nx-cache`: exit 0, 2147 pass, 0 fail (before the two
  `sleepUnlessInterrupted` cases; `report-capacity.test.ts` alone afterwards: 17 pass, 0 fail).
- `bunx nx run twilight-dash:build --skip-nx-cache`: succeeded (observation launcher only; the
  bundle does not reach `src/compute`).
- `bunx nx run tool-fleet:test --skip-nx-cache`: exit 0, 589 pass, 0 fail.
- `bunx nx run tool-devsync:test --skip-nx-cache` (full): exit 0, 898 pass, 0 fail, after the
  slice commit (an earlier run before committing failed only the index checker's
  untracked-path refusal and, once, `names a discovered module missing tsconfig.json`, which
  passed alone and in the full rerun).
- Burokrat `check-indexes working . HEAD`: exit 0; no module index covers a changed file (the
  `store-memory` review debt is unchanged).
- `bunx openspec validate --all --json`: 269 of 269 passed.

### Slice 2 review (Fable, 2026-10-22, PR #659)

The review found the secrets handling, argv pinning and the P10 table sound. Fixed on the same
PR:

- S1-1: `observe(agent_slots)` read `#activeRuns` after the reachability dial, so a run ending
  during the dial raced the count (the run smoke failed 1 run in 4 there; 12 local runs did not
  reproduce it). `observe` now samples runs in use at its start, the instant it stamps. The
  fixture gained a `dialDelay` that holds the dial open for 0.5 s, which makes the old race
  deterministic.
- S2-1: the entrypoint test's in-test kill sits inside an explicit 60 s test budget
  (`ENTRYPOINT_BUDGET_MS`), not at 20 s, and still asserts exit 1.
- S2-2: negatives for `timeout`, `authentication_failed`, `name_unresolved`, `no_route`, a
  non-numeric `nproc`, a missing loadavg line, a header-only `df` and `MemAvailable` above
  `MemTotal`.
- S3-1: no `AbortSignal.any` remains. The request carries `AbortSignal.timeout` alone, with an
  explicit `stop.aborted` check on failure. Each instance loop adds one `stop` listener that
  aborts its current sleep controller.
- S3-2: a `transient` answer resets the `report_superseded` count.
- S3-4: the timeout reason is cut to 200 characters like the 255 reason. Testing it showed the
  command deadline waited for ssh's pipes, which a descendant (the fixture's `sleep`, in
  production a `ProxyCommand`) can hold open. The deadline now answers as soon as the killed
  ssh exits.
- S3-7: `Proof:` comments beside the run-environment refusal, the unknown-255 throw and the
  non-zero remote exit. New negatives for `isFile()`, the 64 KiB configuration cap, the 1 MiB
  output cap and a malformed `200`.
- S3-6: `report-capacity` resolves `ssh` on `PATH` before it validates `--config`. Both
  refusals come before any effect, and the spec says nothing about their order.
- S3-9: spec, tasks and design now say the gate uses a fixture `ssh` client and a real sshd was
  only the rehearsal.

| Fault injected (watched 2026-10-22)                                                | Observed failing test                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_slots` usage read from `#activeRuns` after the dial                         | `counts the runs in use at the stamp, not after the dial`                                                                                                        |
| each `TRANSPORT_FAULTS` entry removed in turn                                      | `answers unreachable for every typed transport fault` (four new causes); the closed-port case (`connection_refused`, `host_key_mismatch`)                        |
| timeout reason not cut                                                             | `bounds an unreachable reason to the 200 characters WBS accepts` (length 254)                                                                                    |
| deadline awaits the pipes (`answered` alone)                                       | the same test's elapsed-time assertion (5001 ms, not under 2000 ms) under the project's `--timeout=60000` (the first watch named only bun's default 5 s timeout) |
| unmatched 255 answered `unreachable`                                               | `throws for an ssh failure that names no transport fault`                                                                                                        |
| non-zero remote exit branch dropped                                                | `throws when the remote command fails on a reachable host` (received the parser's `has no MemTotal line`)                                                        |
| run-environment allow-list refusal skipped                                         | `refuses a run environment key outside the allow-list before ssh starts`                                                                                         |
| 1 MiB output cap dropped                                                           | `refuses an answer over 1 MiB`                                                                                                                                   |
| `AbortSignal.any([wake.signal, stop])` per sleep, or `[stop, timeout]` per request | `adds a fixed number of abort listeners whatever the number of ticks` (16 composites instead of 0), each                                                         |
| superseded count kept across a transient answer                                    | `counts only consecutive report_superseded` (exited `another_reporter`)                                                                                          |
| any `200` answered `stored`                                                        | `throws on a 200 that carries no stored report`                                                                                                                  |
| `isFile()` check skipped                                                           | `refuses a directory config_unreadable…` (raw `EISDIR` escaped)                                                                                                  |
| 64 KiB cap dropped                                                                 | `…and a file over 64 KiB config_malformed` (the file loaded)                                                                                                     |

Recorded, not changed:

- S3-3: an ssh 255 whose diagnostic matches none of the six patterns throws and ends the
  reporter, as the design requires. Examples are `kex_exchange_identification` and
  `Connection reset by peer`. A `connection_closed` reason is a candidate for a later slice.
- S3-5: the command deadline (`setTimeout`) and the request `AbortSignal.timeout` are not on the
  injected `Monotonic`. The fixture drives the timeout branch with a real 200 ms deadline, not
  deterministically.
- S3-8, pre-existing in `tool-fleet` (the coordinator files an issue): the jump's
  `ProxyCommand=ssh …` lacks `-F none`. The transport and `known_hosts` owner check also stats
  the path after `readFile`, so it follows symlinks and checks no uid, unlike Dash's
  `readOwnerOnly`.

Commands after the review fixes (2026-10-22, `env -u CLAUDECODE`):

- `ssh-host.test.ts` six times in a row: 15 pass, 0 fail each run.
- `provider.test.ts`: 11 pass. `report-capacity.test.ts`: 20 pass.
- `bunx nx run-many -t lint typecheck -p twilight-dash tool-fleet --skip-nx-cache --parallel=1`:
  succeeded.
- `bunx nx run twilight-dash:test --skip-nx-cache`: 2158 pass, 0 fail.
- `bunx nx run tool-fleet:test --skip-nx-cache`: 589 pass, 0 fail.

### Slice 2 re-review (Fable, 2026-10-22, PR #659 at `2ca651681`)

The re-review passed. Three items closed on the same PR:

- S2-A: the hang fix's proof named a failure that only appears under bun's default 5 s test
  timeout. `bounds an unreachable reason…` now asserts that the timed-out observation answers in
  under 2000 ms. With `execute` awaiting `answered` alone, it failed at 5001 ms under
  `--timeout=60000`.
- S3-A: `execute` sets a flag when the deadline fires and treats any exit after it as timed
  out, so the answer no longer depends on which branch of the race settles first. With
  `timedOut: false` restored, `answers timeout when a killed ssh has no descendant` still passed
  3 of 3 runs, because `killed` always won in the fixture. With `killed` made never to resolve,
  so that `answered` settles first, the flag passed and `timedOut: false` failed with
  `true on stalled.fixture exited 137`.
- JSDoc: `execute` now says the pipe readers outlive the answer until a descendant closes the
  pipes, and that the race's loser is not an unhandled rejection. `runReporter` now says a stop
  is noticed at the next step, up to one request timeout plus one command deadline late (two
  hard-coded 30 s constants).

Recorded, not changed: S3-C, pre-existing. The 1 MiB output cap is checked on stdout only, and
only after reading all of it; stderr is not capped.

### Slices 3 and 4: `docker` adapter, `kubernetes` stub, `puni_pool` slot (2026-10-22)

Branch `feat/compute-providers-3` from `feat/compute-providers-2` at `551f6d786`. Implemented
tasks 3.1, 4.1 and 4.2.

What landed:

- `compute/execution.ts`: what `ssh-host.ts` held and `docker.ts` now shares, moved unchanged:
  `execute` (deadline, kill, `pastDeadline`, the stdout-only 1 MiB cap), `MAX_REASON_LENGTH`
  and `boundReason`, `firstLine`, `classifyTransportFault`, the run-environment allow-list and
  its refusal, and `RunTracker` (runs in use, run-change listeners). The moved `Proof:` comments
  name the slice 2 tests that still guard the code.
- `compute/docker.ts` and `docker.test.ts`, with `compute/testing/docker-fixture.ts`, a fixture
  `docker` CLI that answers per context from transcripts shaped as the laptop's 29.7.2 CLI
  prints them.
- `compute/kubernetes.ts`: the stub. `ProviderAdapter.isStub` lets the loader refuse it
  `provider_not_implemented` before `open`. `Measurement` gains `not_implemented`, and `run`
  answers `AgentRunHandle | NotImplemented`, with `AgentRunHandle` now carrying
  `kind: 'started'`.
- `cli.ts` registers `docker` and the `kubernetes` stub beside `ssh_host`.
  `no-ambient-clock.test.ts` scans `docker.ts`, `execution.ts` and `kubernetes.ts`, and excludes
  the docker fixture.
- `compute-provider.controller.db.test.ts` (be-01) now asserts that the `docker`, `kubernetes`
  and `puni_pool` instances it registers are listed.
- The Dash CLI README covers the `docker` kind; design.md P9 says where docker disk capacity
  comes from. `CONTEXT.md` is unchanged because no new term appears.

Assumed in these slices (each overrulable):

- `docker stats` has no `--filter` (checked against the 29.7.2 CLI). The adapter therefore runs
  `docker ps --filter label=puni.compute-provider=<id> --format '{{.ID}}'`, then `docker stats
--no-stream`, and sums only the rows whose ids `ps` named. A container that starts or ends
  between the two commands is summed in neither, rather than making `stats` fail on a missing id.
  Rows of containers `ps` did not name are skipped before their values are read. A labelled row
  whose sample failed (`CPUPerc` `--`, `MemUsage` `-- / --`) adds nothing and is counted
  `in transit` in the evidence (review S1-1, below).
- `disk_gib` on `docker` reports usage as every `docker system df` row summed (the daemon's
  whole disk, not only labelled containers). Capacity is a new binding field, `ceilingGib`,
  because the daemon states no disk size. A docker disk binding takes `ceilingGib` and no
  `path`; an `ssh_host` disk binding takes `path` and no `ceilingGib`.
- `docker` measures `memory_gib`, `cpu_cores` and `disk_gib`. `agent_slots` is refused
  `unsupported_measure`.
- `cpu_cores` usage is the labelled containers' `CPUPerc` summed (100 % per core), floored and
  capped at `NCPU`. Memory usage is the left side of `MemUsage` summed, floored to GiB.
- `run` needs the instance's new `runImage`. Without it `capabilities.runs` is false and `run`
  rejects. The environment goes through `--env K=V`, so the allow-listed values are visible in
  the local process list, as with ssh's remote command line.
- The CLI receives only `PATH`, `HOME`, `DOCKER_CONFIG` and `SSH_AUTH_SOCK`, never
  `DOCKER_HOST`. `docker` is looked up on `PATH` when the command starts, but its absence is
  refused only when a docker instance opens. `ssh` is still required up front, as in slice 2.
- The CLI exits 1 for every error, so the exit code says nothing about the cause. A non-zero
  exit whose stderr names a transport fault answers `unreachable`. There are eight faults:
  `socket_permission_denied`, `daemon_unreachable`, `host_key_mismatch`,
  `authentication_failed`, `connection_refused`, `timeout`, `name_unresolved` and `no_route`.
  Any other non-zero exit throws, an unknown context included. stdout is read only after exit 0,
  because a failing `docker info` still prints a JSON object with `MemTotal: 0`.
- The context name follows Docker's own rule, bounded to 64 characters and never starting with
  `-`. `runImage` is an image reference, bounded to 255 characters, never starting with `-`.
  Both are checked by the loader's schema (`config_malformed`, naming the field and never the
  value).
- The `kubernetes` stub reads no kube context or namespace, and the loader refuses it before
  `open`. If the stub were accepted, its `not_implemented` would be sent as the report's outcome
  and WBS would refuse it `400 invalid_body`, which ends the loop as a refusal.

R5 proofs. Each fault was injected into production source and the named test watched failing,
then the source was restored:

| Check                                       | Injected fault                                               | Observed failing test                                                                                                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| usage sums only labelled containers (3.1)   | `sumLabelled` keeps every `docker stats` row                 | `sums only the containers labelled with this instance` (instance-a `usageUnits` 5, not 1: all four running containers) and the memory evidence case (`4 labelled containers`)                                        |
| a stub is refused at startup (4.1)          | `adapter.isStub` check skipped                               | `refuses a kubernetes instance at startup, never reaching the stub` (received `refused: instance cluster-1 resource cluster-ram: HTTP 400 invalid_body`) and the loader case                                         |
| daemon refusing the socket is `unreachable` | `daemon_unreachable` removed from `TRANSPORT_FAULTS`         | `answers unreachable when the daemon refuses the socket, without throwing` (threw `exited 1 without a transport fault`) and the 200-character case                                                                   |
| forbidden socket is `unreachable`           | `socket_permission_denied` removed                           | `answers unreachable for every typed docker transport fault`                                                                                                                                                         |
| unmodelled CLI failure throws               | unmatched non-zero exit answered `unreachable`               | `throws for a docker failure that names no transport fault, and for an unknown context` (resolved)                                                                                                                   |
| missing `MemTotal` / non-JSON throws        | `parseInfo` error caught and answered `unreachable`          | `throws for docker info without MemTotal and for an answer that is not JSON` (resolved)                                                                                                                              |
| docker disk takes `ceilingGib`              | the `ceilingGib` comparison in `checkBinding` dropped        | `refuses a docker disk binding without ceilingGib or with a path config_malformed` and an existing `refuses malformed JSON and a malformed shape` case                                                               |
| no wall clock in the new modules            | `Date.now()` appended to `docker.ts`, then to `execution.ts` | `only clock.ts reads the wall clock` (`+ "compute/execution.ts"`), each                                                                                                                                              |
| the moved deadline still answers early      | `execute` awaits `answered` alone                            | `bounds an unreachable reason…` in `ssh-host.test.ts` (5002 ms, not under 2000 ms). The docker stalled case passed under this fault, because its fixture `exec`s `sleep` and leaves no descendant holding the pipes. |

Rehearsal against the laptop's Docker 29.7.2 daemon (2026-10-22, scratch script outside the
repository, production `dockerAdapter`, context `default`). Throwaway `alpine:3` containers:
one labelled `rehearsal-a` spinning one core, two labelled `rehearsal-b` (one spinning, one
sleeping) and one unlabelled spinner. Two throwaway contexts pointed at sockets under
`$XDG_RUNTIME_DIR`, one with no listener and one with mode 000. Every container and both
contexts were removed afterwards; `docker ps -a --filter name=puni-reh` was empty.

| Case                          | Result                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_gib`, instance a      | `measured` 30/0, evidence `1 labelled containers; MemTotal 33227800576 B; in use 2129658 B`                                                                 |
| `cpu_cores`, a and b          | a: 24/1 (`CPUPerc 100.44%`, one container); b: 24/1 (`100.52%`, two containers). The unlabelled spinner was counted in neither                              |
| `disk_gib`, `ceilingGib: 400` | `measured` 400/50, evidence `Images 14.83GB, Containers 2.925GB, Local Volumes 20.42GB, Build Cache 15.62GB`                                                |
| `run` with `LANG`             | `{"exitCode":0,"stdout":"C.UTF-8 3.24.2\n"}` (the container's Alpine release)                                                                               |
| socket with no listener       | `unreachable`, `docker daemon_unreachable: Cannot connect to the Docker daemon at unix:///run/user/1000/puni-reh/dead.sock. …`                              |
| socket with mode 000          | `unreachable`, `docker socket_permission_denied: permission denied while trying to connect to the docker API at unix:///…/perm.sock`                        |
| unknown context               | threw `… exited 1 without a transport fault: Failed to initialize: unable to resolve docker endpoint: context "puni-rehearsal-absent": context not found …` |

The first rehearsal tried to put the throwaway sockets in the scratchpad, and Docker refused the
path as too long for a unix socket. The second rehearsal used `$XDG_RUNTIME_DIR`.

Not run or not verified:

- Fixture and laptop only. No `tcp://` or `ssh://` context was dialled except the laptop's
  `ssh://nobody@127.0.0.1:1` probe that shaped the `connection_refused` transcript. The
  `timeout`, `name_unresolved`, `no_route`, `host_key_mismatch` and `authentication_failed`
  transcripts are written from the CLI's message shapes, not observed.
- The `--` row of a container removed mid-sample is the reviewer's report of the CLI, encoded in
  the fixture; it was not observed on the laptop daemon.
- No memory-heavy labelled container: the rehearsal's labelled memory floored to 0 GiB.
- Task 2.4 (dev registration) is still open, and no docker instance is registered on dev.
- `tool-fleet` was not touched and its tests were not rerun.

Commands, run 2026-10-22 in `/home/df/wd/puni/wt-compute-providers-3` with `env -u CLAUDECODE`:

- `bunx nx run-many -t lint typecheck -p twilight-dash --skip-nx-cache --parallel=1`:
  succeeded. The first run failed on one `simple-import-sort` error in `cli.ts`, which was fixed.
- `bunx nx run twilight-dash:test --skip-nx-cache`: exit 0, 2177 pass, 0 fail.
- `bunx nx run twilight-dash:build --skip-nx-cache`: succeeded.
- `bun test src/controller/compute-provider.controller.db.test.ts` (be-01): 27 pass, 0 fail.
- `bun test src/eslint-boundaries.test.ts` (tool-devsync): 28 pass, 0 fail.
- `bunx openspec validate --all --json`: 269 of 269 passed.
- Burokrat `check-indexes working . HEAD` after the commit: exit 0, 39 indexes, none covering a
  changed file; the only review debt is the existing `store-memory` one (48 entries, limit 40).

### Slices 3 and 4 review (Fable, 2026-10-23, PR #662)

Fixed on the same PR:

- S1-1: a `--` row in `docker stats` ended the reporter. The CLI prints such a row for a
  container removed mid-sample, a finished `docker run --rm` agent among them, or whose sample
  timed out. The adapter parsed every row before narrowing to the labelled ids, so another
  tenant's or another instance's container, not only a labelled one, could throw. `sumLabelled`
  now skips unlabelled rows before reading their values. A labelled `--` row adds nothing and is
  counted `in transit`. Any other malformed labelled row still throws.
- S3-a: the evidence reads `<n> labelled; <n> sampled; <n> in transit`. A labelled container that
  `ps` named but `stats` did not sample is visible as the gap between the first two numbers.
- S3-b: the `runReporter` JSDoc now states the real stop bound: one request timeout plus one
  observation, where a docker memory or cores observation is up to three 30 s commands, so up to
  30 s + 90 s.
- S3-c: the README says to use a named context, not `default` (`DOCKER_HOST` is not passed, and
  rootless Docker's `default` depends on it). It also says the reporter user's credential helpers
  pull a private `runImage`.
- S3-d: a context name needs two characters at least, as Docker's own rule does. `a` is now
  `config_malformed` at load instead of `context not found` at the first observation.
- S3-e: design.md P9 says WBS stores usage above `ceilingGib` as reported.

| Fault injected (watched 2026-10-23)                               | Observed failing test                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| every row's values read before the label skip (the pre-fix order) | `skips unlabelled rows unread and counts a labelled sample in transit` threw `answered a CPUPerc it cannot read` |
| the label skip removed                                            | the same test, `sums only the containers labelled with this instance` and the memory evidence case               |
| the labelled `--` branch removed                                  | `skips unlabelled rows unread…` threw `answered a CPUPerc it cannot read`                                        |
| context pattern back to `{0,63}`                                  | `refuses a docker context or image that could read as a flag config_malformed` (loaded the context `a`)          |

A later refinement, not done: take one `info`/`ps`/`stats` sample per instance per tick and
share it between the memory and cores bindings. Today each of those bindings samples again.

Commands after the review fixes (2026-10-23, `env -u CLAUDECODE`):

- `docker.test.ts`: 13 pass. `provider.test.ts`: 16 pass.
- `bunx nx run-many -t lint typecheck -p twilight-dash --skip-nx-cache --parallel=1`: succeeded.
- `bunx nx run twilight-dash:test --skip-nx-cache`: exit 0, 2178 pass, 0 fail.
- `bunx openspec validate --all --json`: 269 of 269 passed.

### Slice 5: fe-01 panel, resources section, refusal copy (2026-10-23)

Branch `feat/compute-providers-5` from `6b0d580fa`, the head of PR #662 (`feat/compute-providers-3`), which the `plan/compute-providers` head carries once #662 merges. Implemented
tasks 5.1 and 5.2; 5.3 (the directory row chip) is not done. No be-01 change.

What landed:

- `components/organization/compute-providers-panel.tsx`: `ComputeProvidersSlot` takes the page's
  one `useOrganizationRole` read, like `LimitsSlot` and `MachineCredentialsSlot`. An admin or a
  super-admin gets the panel. A member or a viewer gets nothing and sends no request. A failed
  role read renders with a retry. The panel lists each instance with its kind, locator and
  resource count. It registers (the kind select is the contract's four kinds), renames or
  relocates (only the changed fields are sent; an unchanged edit sends nothing), and removes.
  A removal is confirmed once. An `in_use` refusal is then shown as a second confirmation that
  names every resource from the body, and only that one sends `?cascade=true`. The panel
  renders loading, empty and a failure with retry. A `forbidden` read renders no panel.
  Refusals are worded in `compute-provider-refusal.ts`.
- `components/wbs/resources-panel.tsx`: a seventh project settings section, **Resources**. It
  reads `GET /api/projects/:id/resources` each time its tab is shown, never while it is hidden.
  An admin also gets `GET /api/organization/compute-providers`. Each resource shows its
  declared number or `Unstated`. An admin gets a select naming each instance and its kind, which
  sends `patchResource.patch.providerId` through the directory commands. A member, whose
  instances read is `forbidden`, sees "Fulfilled by a compute provider" with no picker and no
  adopt. The report is read by `readReport` on the section's own clock, which ticks every 30 s.
  Adopt is offered to an admin on a fresh measurement that differs from the declared number. It
  sends one `setResourceCapacity` and rereads the plan. Its Undo sends the previous units back,
  or `null` when the capacity was unstated.
- `lib/compute-provider-words.ts`: kind names, locator hints, `inUseSentence` (names from the
  body), and `readReport`. `readReport` gives `no_report`, `measured`, `unreachable` or `stale`,
  with the stale boundary named ("Dash reports every 5 min; a report is stale after 15 min
  (3 × cadence)"). The state comes from the domain's `capacityReportStateOf` through a new
  fe-01 alias `@wbs/domain/compute-provider`, added to the four fe-01 tsconfigs, `vite.config.ts`,
  `vitest.config.ts` and `vite-config.test.ts`.
- `plan-refusal.ts`: sentences for `unknown_provider` and `provider_not_in_organization`. Also
  `batchRefusalSentence`, which words a refused batch body for a surface that reads the reply
  rather than catching `WbsRequestError`; the limit sentences keep the body's numbers and name
  the resource. The `in_use` naming resources is the provider removal's (an organization route),
  so its words are `inUseSentence`, not a `PLAN_REFUSALS` entry.
- `testing/live-application.tsx`: the plan tests' `render` now also mounts a legacy
  `OrganizationResourcesProvider`, as `app.tsx` always does, because the settings modal holds a
  section that reads through it. Tab lists in `project-settings-modal.test.tsx`,
  `plan-toolbar.test.tsx`, `e2e/project-settings.spec.ts` and `e2e/settings-layout.spec.ts`
  gained `Resources`.

Assumed in this slice (each overrulable, named for Dany):

- **Undo is a compensating write.** P7 calls the adopt "journalled, undoable", but
  `setResourceCapacity` is not journalled ("Not journalled, like setCapacity"). The plan's Undo
  cannot take it back, so the section's own Undo writes the previous statement back, or clears
  it to unstated. The plan's Undo stack is untouched.
- **Admin is read off the instances list.** Only an admin may list instances (P2). The section
  shows the picker and Adopt where that read succeeds and treats `forbidden` as a member or a
  viewer. Adopt is therefore admin-only in the UI, as P7 says, while be-01 still admits
  `setResourceCapacity` from any project writer.
- **A member sees the reference unnamed.** The resources read carries `providerId` only, so a
  member cannot see which host fulfils a resource. Naming it needs a be-01 change: carry
  `provider: { kind, name }` on the read. Not made here.
- **Adopt only on a fresh measurement.** A stale or unreachable report offers no Adopt, and
  neither does a measurement equal to the declared number.
- **The directory row chip is not built (task 5.3).** The directory page lists no resources and
  no read lists the directory's resources outside a project; both are `wbs-resources` 1.5.
- **Slice 5 went ahead before `wbs-resources` 1.5**, which task 0.1 names as a prerequisite. The
  Resources section is the part of 1.5 this change needs (read-only declared capacity, provider
  reference, report, adopt). 1.5 still owes declared-capacity editing and the row's Resources
  cell.

R5 proofs, each fault injected by script, the named test watched failing, the file restored
(2026-10-23, `env -u CLAUDECODE`):

| Check                                                | Injected fault                                                  | Observed failing test                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| a missing report is never a number (task 5.2 line)   | `readReport(undefined)` answered as a `measured 0` report       | `renders no report yet, and no number, for a resource with no report`; `never reads a missing report as a number`    |
| stale at exactly 3 × cadence                         | the domain's `>` made `>=`                                      | `is measured at exactly three cadences and stale one millisecond past, naming the boundary` (`stale` for `measured`) |
| impossible report outcome reaches the Error Boundary | the outcome switch's default answered `no_report`               | `routes an impossible report outcome to the Error Boundary`; `throws on an outcome the contract does not have`       |
| impossible kind reaches the Error Boundary           | `providerKindName` default answered `''`                        | `routes an impossible kind to the Error Boundary`                                                                    |
| a register refusal never renders as success          | the refusal arm closed the dialog, said `Registered` and reread | `renders name_taken / forbidden / invalid_body on register and keeps the draft, never as success` (all three)        |
| `name_taken` words                                   | answered with the `unknown_provider` sentence                   | `renders name_taken on register and keeps the draft, never as success`                                               |
| `in_use` becomes the cascade confirmation            | `in_use` sent to the plain sentence                             | `names the referencing resources and removes them only with cascade`                                                 |
| removal admission                                    | `isPending` check removed                                       | `serializes a double-clicked removal` (two DELETEs)                                                                  |
| `forbidden` read renders no panel                    | treated as a failure                                            | `renders no panel when the read answers forbidden`                                                                   |
| previous organization's list fenced                  | generation fence removed                                        | `never shows the previous organization's providers after a switch`                                                   |
| slot by role                                         | panel rendered for every role                                   | `sends no providers request and renders no panel for a member` and `… for a viewer`                                  |
| failed role read rendered                            | slot rendered nothing on `failure`                              | `renders a failed role read with retry, and recovers`                                                                |
| page composes the slot                               | slot omitted                                                    | `composes the compute providers panel for an admin`                                                                  |
| a member's `forbidden` instances read is not shown   | `forbidden` read as unavailable                                 | `shows a member each reference unnamed, with no picker and no adopt`                                                 |
| a refused adopt never renders as adopted             | refusal answered `true` (landed)                                | `says a refused adopt in place and offers no undo`                                                                   |
| adopt lands once                                     | the write admission removed                                     | `adopts once however often it is clicked, and undo restores the declared number` (two commands)                      |
| provider reference refusal words                     | `unknown_provider` entry struck                                 | `words both provider reference refusals: unknown_provider` (fallback carried the code)                               |

Eye review (Chromium 1280 and 375 wide against vite and a real be-01: `BootedBrowserProcess`
over a migrated, activated SQLite. Seeded through the routes: four instances, five resources,
three capacities. Reports were inserted by SQL with ages relative to now). Screenshots are in the
coordinator's scratch directory `providers-shots/`. Page errors: none. Horizontal overflow: 0 px
in every shot. Seen and changed:

- `01-panel-populated-1280`, `06-panel-populated-375`: the first rows were tall (locator, count
  and buttons stacked). They now put locator · count on one line, with the actions on the right
  from `sm`.
- `02-panel-edit-1280`, `03-panel-remove-confirm-1280`, `04-panel-in-use-1280`,
  `07-panel-in-use-375`: the edit form and both confirmations sit inside the row. The cascade
  button names the count ("Remove and clear 2 references").
- `05-register-name-taken-1280`: the refusal is under the fields and the draft is kept.
- `08-panel-empty-1280`: fine. `09-panel-failure-1280`: the alert stood below its Retry, so it
  now comes first.
- `10-resources-admin-1280`, `13-resources-admin-375`: the first cut showed a kind chip and the
  name beside a select that said the same thing, so an admin now sees one labelled select.
  Stale used the destructive colour as unreachable did. It now reads in the foreground colour in
  the dashed box, and only unreachable is red. The intro now says a reference is the directory's,
  shared by every project.
- `11-resources-adopted-1280`, `12-resources-undone-1280`: adopt and undo went through the real
  be-01. Declared moved 12 → 15 GB and back to 12; the undone shot is byte-identical to the
  first.
- `14-resources-member-1280`: the first cut drew an unnamed "Compute provider" chip, which read
  as a label. It now says "Fulfilled by a compute provider". A member's `/organization` showed
  no providers panel (0 regions).
- On a phone the settings tabs are three per row (F-053), so the seventh tab, `Resources`,
  stands alone on a third row. Left as is.

Commands (2026-10-23, `/home/df/wd/puni/wt-compute-providers-5`, `env -u CLAUDECODE`):

- `bunx nx run wbs-fe-01:typecheck --skip-nx-cache`: succeeded.
- `NODE_OPTIONS=--max-old-space-size=8192 bunx nx run wbs-fe-01:lint --skip-nx-cache`: succeeded.
- `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`: 81 files, 992 tests passed. This includes
  the two new DOM-free suites registered in `vitest.node-suites.json`; `src/test-tiers.test.ts`
  passed 6 of 6.
- The organization DOM suites (`vitest run src/components/organization`, one worker): 17 files,
  351 tests passed.
- `resources-panel.test.tsx` 17 pass. Before the last eye-review edits, which changed only the
  resources row markup, `project-settings-modal.test.tsx`, `settings-busy.test.tsx`,
  `plan-toolbar.test.tsx` and `plan-cards.test.tsx` passed: 233 tests.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`:
  exit 0. No new file lies under a module index. The only review debt is
  `libs/wbs/adapters/store-memory/src/README.md`, which was already there.
- `bunx openspec validate --all --json`: 269 of 269 passed.

Not run or not finished:

- The full `wbs-fe-01:test` target (every DOM suite in UTC, then the Auckland zoned run). Claude
  Code stopped it for low memory on the laptop after its `test:unit` dependency had passed. The
  DOM suites this slice touches are listed above; CI runs the rest.
- `tool-devsync:test` was not run.
- The e2e specs whose tab lists gained `Resources` (`project-settings.spec.ts`,
  `settings-layout.spec.ts`) were not run locally; CI's `pixels` job runs them.

### Slice 5 review (Fable, 2026-10-23, PR #664)

No S1. Fixed on the same PR:

- S2-1 (lost update): the section held an adoption across rereads, so Undo could write the old
  number over another writer's. The adoption is now dropped by `read` once the declared number
  differs, and the Undo block renders only while the declared number equals the adopted one.
- S2-2: the 30 s clock is tested. With `setInterval` faked, a report 10 s inside the boundary
  reads `measured`, then `stale` 30 s later, without a reread.
- S2-3, S2-4: spec and design P7 now say Adopt is the explicit `setResourceCapacity` any project
  writer could send, offered in the UI to organization admins only. Undo is a compensating write,
  offered while the declared value still equals the adopted one. An admin sees the kind and name;
  a member or a viewer sees the reference unnamed.
- S2-5: a failed instances read for an admin (5xx or a refusal other than `forbidden`) renders
  as an alert with Retry.
- S3: the providers panel's cleanup also clears `isSending`. The resources `write` fences its
  failure and refusal arms by generation. `@wbs/domain/compute-provider` is in
  `tsconfig.base.json`, as precedent 574427f34 put the other subpaths there. The locator hint
  uses `agent@build-host-1`.

| Fault injected (watched 2026-10-23)                                         | Observed failing test                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| both adoption guards removed (the drop in `read` and the render comparison) | `offers no undo once another writer stated a different number` (Undo over 20 GB) |
| the 30 s `setInterval` replaced by a no-op timeout                          | `goes stale on its own clock without a reread` (`measured` for `stale`)          |
| a failed instances read treated as `unnamed`                                | `renders a failed instances read with retry, and recovers` (no alert)            |

Either adoption guard alone hides Undo, so only the pair was watched.

Remaining S3s, recorded and not fixed:

- Refresh in the providers panel discards an open edit draft or a removal confirmation.
- In the Resources section, refusals that mean access was lost (session ended, organization
  changed) render as in-section sentences instead of giving the page up.
- On a phone the seventh settings tab sits on its own row.
- The section's clock does not pause on `visibilitychange`.
- Later refinement: carry `provider { kind, name }` on the resources read, so a member sees
  which instance fulfils a resource.
