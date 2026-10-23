## 0. Dany reads P1 to P14

- [ ] 0.1 Dany confirms or amends design.md P1 to P14, in particular P3 (the reference on
      `resource`, set by `patchResource`), P5 (one `PUT`, latest wins, no history), P6 (agent
      machine principal only) and P7 (declared wins; adopt is an explicit
      `setResourceCapacity`). Slice 1 may proceed on P2 to P6; slice 2 waits for P8 to P10;
      slice 5 waits for P7 and P12 and on `wbs-resources` task 1.5.

## 1. WBS: provider instance, reference and report

- [x] 1.1 Migration `add_resource_provider`: `compute_provider` (kind CHECK, name per
      organization), `resource.provider_id` nullable with its index, `resource_capacity_report`
      (outcome CHECK: `measured` has both unit columns and no reason, `unreachable` the
      reverse), `down.sql` refusing while any instance, reference or report exists.
      Red: `resource-provider-migration.db.test.ts` forward, back, and the refusal with one
      referencing resource. R5 fault line: drop the guard and the rollback deletes the
      instance and clears the reference silently; watched, restored, `Proof:` adjacent.
- [x] 1.2 Red: `compute-provider.test.ts` in `@wbs/domain` for the pure report decisions.
      As shipped, register bounds live in the contract (arktype) and `name_taken` and the
      reference refusals (`unknown_provider`, `provider_not_in_organization`) in the SQLite
      store, each tested through `compute-provider.controller.db.test.ts`; the domain holds
      report admission (`not_an_agent_principal` for session,
      delegation and a `person`-pinned machine; `unknown_provider` across organizations;
      `provider_mismatch`; `report_superseded`; `observedAt_in_future`; same-body idempotence).
      Property: for any sequence of reports on one resource, the stored `observedAt` never
      decreases and equals the newest accepted one. Green: the decisions.
- [x] 1.3 Store port `ComputeProviders` (SQLite only as shipped: no memory twin and no
      conformance case for the instance store; the reference write
      `DirectoryStore.setResourceProvider` has both): instances
      by organization, reference count per instance, `putReport` compare-and-replace on
      `observedAt` inside one transaction, cascade removal. R5 fault line: perform the
      `observedAt` comparison outside the write transaction and two racing reporters store the
      older one; watched through the write coordinator race test, restored, `Proof:`.
      **Not done:** this race fault line is unverified (see the slice 1 notes).
- [x] 1.4 Routes `/api/organization/compute-providers` (admin, audit rows, `in_use` with
      cascade) and `PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report`
      with a handler check of the machine principal (not a policy kind);
      `patchResource.patch.providerId`; `GET
/api/projects/:id/resources` carries `providerId` and `report`; MCP tool count moves by
      the new route family only. Red: `compute-provider.controller.db.test.ts`, one case per
      scenario of the spec; the schedule-hash and claim no-op cases against a stored report.
      R5 fault line: remove the `authentication.kind === 'machine'` predicate from the handler
      and the browser-session case stores a report; remove the organization join from the
      instance lookup and B's key reports to A's instance; each watched, restored, `Proof:`.
- [x] 1.5 Plan export and plan document: assert byte-identical output with and without
      references and reports (golden corpus). Negative: carry `providerId` in the export and
      the import test of a foreign organization names a stranger's instance; watched.

Slice 1 notes (2026-10-22, `verify.md` Slice 1): the instance store has no memory twin; the
memory composition holds no instance (`NO_COMPUTE_PROVIDERS`), and only the reference write
(`DirectoryStore.setResourceProvider`) is in the conformance suite. The 1.3 race fault line is
unverified: one process's gate serializes both reporters, so no in-process test interleaves
them. The audit vocabulary is widened by one compatible rebuild
(`20261022140100_widen_organization_audit_compute_providers`), not the #632 trigger allow-list.

## 2. Dash: provider port, SSH-host adapter, reporter; h2puni and h4claw into dev

- [x] 2.1 Red: `compute/provider.test.ts` for the `ComputeProvider` union, binding
      validation (`unsupported_measure`, `provider_kind_not_available`,
      `provider_not_implemented`), config load (`config_absent`, `config_malformed`,
      `credential_not_owner_only`) with the injected clock; no `Date.now` (extend
      `no-ambient-clock.test.ts`). Green: the port and the loader.
- [x] 2.2 `ssh_host` adapter over the pinned transport of `discovery-ssh-transport`:
      `memory_gib`, `disk_gib`, `cpu_cores`, `agent_slots`; `run` smoke. Red: the local SSH
      fixture cases of the spec (a fixture `ssh` client in the gate; a real sshd in the rehearsal) (measured, port closed, missing `MemTotal`, `df` unparseable
      throws). R5 fault line: catch the parse error and answer `unreachable` and the nonsense
      case passes vacuously; watched, restored, `Proof:`.
- [x] 2.3 `report-capacity` loop: cadence, after-run ticks, the outcome table of P10, never
      prints the credential. Red: a fake WBS asserting one `PUT` per binding per tick with
      `cadenceSeconds`, the three-superseded exit, the `401` exit, the single `5xx` retry.
      R5 fault line: turn the `401` exit into a logged continue and the revoked-credential
      case keeps sending; watched, restored, `Proof:`.
- [ ] 2.4 Operator (not code): register `h2puni` and `h4claw` in PUNI's dev organization,
      reference the gate hosts' resources, issue an API-key credential for an agent person,
      run the reporter as `puni1` on h2puni under the observation-service pattern; record the
      first stored reports in verify.md; add the steps to `docs/infra/gate-hosts.md`.

## 3. Dash: Docker adapter

- [x] 3.1 `docker` adapter: `docker info`, `docker stats --no-stream` over the instance
      label, `docker system df`, `run` as `docker run --rm` with the label. Red: fixture
      transcripts for each command, a daemon that refuses the socket (`unreachable`), a
      `docker info` without `MemTotal` (throws). R5 fault line: sum usage over all containers
      instead of the labelled ones and the two-instance fixture over-reports; watched.
      As shipped: `docker ps --filter label=…` names the labelled containers, since
      `docker stats` cannot filter; `disk_gib` capacity is the binding's `ceilingGib`; `run`
      needs the instance's `runImage`; `agent_slots` is not a docker measure. The in-gate cases
      run against a fixture `docker` CLI; the laptop daemon is the rehearsal (verify.md).

## 4. Dash: Kubernetes stub and the PUNI pool slot

- [x] 4.1 `kubernetes` stub answering `not_implemented` from every method; the loader refuses
      `provider_not_implemented` before dialling. Red: the loader case; the stub's methods are
      never reached by the reporter (spy). R5 fault line: let the loader accept the stub and
      the reporter sends a body WBS refuses `400 invalid_body`; watched.
- [x] 4.2 `puni_pool`: the kind in WBS (`compute_provider.kind` CHECK, slice 1.1) and in the
      port's `ProviderKind`; no adapter; loader refuses `provider_kind_not_available`. Red: the
      loader case; a WBS instance of that kind registers and is listed.

Slice 4 notes: the stub's refusal is the loader's (`ProviderAdapter.isStub`), checked before the
adapter opens; `run` answers `{ kind: 'not_implemented' }` through a widened return type
(`AgentRunHandle` gained `kind: 'started'`). The kubernetes stub reads no kube context or
namespace. The pool loader case and its proof are slice 2's; slice 4 adds the WBS listing.

## 5. fe-01: panel, resources section, directory row (after `wbs-resources` 1.5)

- [x] 5.1 Organization "Compute providers" panel: list, register, rename or relocate, remove
      with the `in_use` confirmation naming the resources; loading, empty and query-failure
      states. Red: rendering tests per state; eye review per the UI acceptance rule.
- [x] 5.2 Project settings resources section: provider chip and report states (`no report
yet`, measured, unreachable, stale at 3 × cadence), the adopt action writing
      `setResourceCapacity`. Red: the four states and the stale boundary at exactly
      3 × cadence; the adopt command lands once and undo restores. R5 fault line: render a
      missing report as `measured 0` and the no-report case passes; watched, restored,
      `Proof:`. Eye review. As shipped: an admin picks the instance in a select that names it
      and its kind; a member or viewer sees the reference unnamed, because the instances list
      is admin-only and the resources read carries the id alone. Undo is a second
      `setResourceCapacity` with the previous units or `null`, because the command is not
      journalled. The directory row chip moved to 5.3.
- [ ] 5.3 Directory row chip (kind and instance name). Not done in slice 5: the directory page
      has no resource row and no directory-scoped resources read exists; both are
      `wbs-resources` task 1.5.
