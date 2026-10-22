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
