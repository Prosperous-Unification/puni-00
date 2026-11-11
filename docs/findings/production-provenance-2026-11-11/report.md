# Production provenance and recovery coverage — 2026-11-11

The read-only diagnosis in priority 1 of the
[November assessment](https://github.com/Prosperous-Unification/puni-00/blob/730a54fadabd454a00d3413b07bd79a3cac03224/docs/findings/puni-assessment-2026-11-10/roadmap.md#prioritized-bounded-actions)
is complete. **Production runtime → immutable registry artifact is established for
all three routed application tiers. Artifact → independently proved source/build
→ accepted checks remains unproved.** W03 and complete recovery W10 remain open.
No production process, routing, state, image, backup, credential or setting was changed.

Source baseline and GitHub main were both
`7614ca5116e2b27831076f7bc7c9f9872051c388`. Live reads ran on November 11 around
05:45–05:52 UTC; individual timestamps and sanitized primary observations are in
[evidence.json](evidence.json). [Verification and limits](verify.md) distinguish
fresh reads, historical receipts, static source findings and unexecuted work.

## Runtime and immutable artifacts

Caddy's actual admin configuration routes `wbs.bulletpoints.club` as follows.
Each running container names a digest-pinned registry reference. Authenticated
registry GETs returned matching `Docker-Content-Digest` and locally computed body
SHA-256. Each manifest's config blob was also hash-checked; its filesystem layer
identities, image environment, labels, command and entrypoint match the local image.
The full container IDs, routes, manifest bodies and config identities are retained
in the evidence. These observations identify the configured images; they do not
attest absence of writable-layer modification inside a running container.

| Tier / live path  | Container     | Verified registry manifest digest                                         |
| ----------------- | ------------- | ------------------------------------------------------------------------- |
| Backend `/api/*`  | `be-01-green` | `sha256:ebc269d2f5a4ef99eeee60c0ad69e5ed657407265dee32230301e70930ad6385` |
| Gateway `/ws*`    | `gw-01-green` | `sha256:81c3552868199f89c147eab06f0e9b2c99092c6d16f7262190d7a35a3e30743e` |
| Frontend fallback | `fe-01-blue`  | `sha256:310f4fb8a1ed8550cda3eeb767cfe15dd7e0c89beed437aded1ffd9093d8ebf5` |

All three state files claim `0afc77758131bc4257dcaa78f0b26bc97ffd92dc`, and all
three registry tags with that name currently resolve to the corresponding digest
above. Phase files read `committed`. Containers were created August 23 and last
started August 24; image configs record August 3. A restart date is not a build date.

This **corroborates the recorded release claim** but does not recover its missing
build/check receipt. A mutable tag and a mutable state file are not independent
build attestations. No application `WBS_SHA` exists in the three registry configs,
image environments or projected history. Backend/gateway OCI revision
`0d9b296af33f2b851fcbf4df3e9ec89751734ba4` is explicitly attributed to the Bun
base image (`oven-sh/bun`, `1.3.14-alpine`). Frontend inherits Caddy metadata and
has no OCI revision. Neither supplies an application revision.

## Why the historical chain stops

- At recorded source `0afc7775…`, the publisher used the Git SHA for the tag and
  release record, but did not stamp it in the image. The application label was
  added later, on September 18 in
  [62d94f56](https://github.com/Prosperous-Unification/puni-00/commit/62d94f568c0e102c2712f2260040ba2e5022001f).
  The missing label is consistent with the historical publisher. See the
  [historical publisher](https://github.com/Prosperous-Unification/puni-00/blob/0afc77758131bc4257dcaa78f0b26bc97ffd92dc/tools/tool-dagger/src/main.ts)
  and [target](https://github.com/Prosperous-Unification/puni-00/blob/0afc77758131bc4257dcaa78f0b26bc97ffd92dc/tools/tool-dagger/project.json).
- GitHub returned **zero check runs, zero commit statuses and zero Actions runs**
  for the recorded SHA. The empty combined-status response says `pending`; it
  does not mean a historical test is still running. These reads establish no
  retained GitHub acceptance evidence, not that no verification ever happened.
- The actual default release path is
  `/home/puni1/wbs-build/dist/tool-dagger/release.json`. It exists, but contains
  **only gateway**, for `bc5e81538c63619259d12187532686d5c0c09e4b`, with a different
  digest. It cannot establish the current three-tier release. The root-level
  `release.json` is absent and is not the default path.
- The legacy build checkout is at `0623a9740720d97bfa5f3e37cbc55b9521837778`,
  with a tracked frontend-test modification (exact historical path in the evidence).
  It was preserved. The installed prod `swap.js` hash begins `7e8f65aa…`, versus
  `ecc8c315…` for that checkout's built swap; installed smoke begins `9e23d75e…`,
  versus `9e0cb775…` in the correct `dist/tool-smoke/smoke.js` path. These establish
  inequality, not an accepted source identity for either installed bundle.

Historical source/build/gate provenance was **not recovered from these inspected
sources**. Other operator archives may still exist; no exhaustive filesystem,
account, backup-history or third-party log search was performed. Preserve the old
images, state and executor evidence. Never relabel them with today's application SHA.

## Current source acceptance gap

Current publication does stamp `WBS_SHA` on every tier. The supported Compose
deploy path checks clean source, release-record SHA equality, digest syntax,
installed bundle equality and registry presence. It does **not** verify the
registry image's application label against that SHA or consume an accepted gate
receipt. A dry-run returns before the installed bundle/registry execution checks.
This is a static finding; no live deploy or new negative test was executed.
Sources: [publisher](../../../tools/tool-dagger/src/main.ts),
[Compose planner/execution](../../../tools/tool-deploy/src/deploy.ts),
[registry preflight](../../../tools/tool-remote-scripts/src/swap.ts),
[supported CLI fixture](../../../tools/tool-deploy/src/legacy-delivery.test.ts).

The Kubernetes descriptor path already has digest-verified manifest/config reads,
application-label and exact-source/gate predicates. Reuse that machinery in a
bounded Compose repair before a replacement release; moving production platforms
is outside this diagnosis. Sources:
[registry reader](../../../tools/tool-deploy/src/k8s/registry.ts),
[descriptor acceptance](../../../tools/tool-deploy/src/k8s/descriptor.ts).

## Current recovery coverage

The installed h1claw implementation is the Claire `sqlite-backup.mjs`, fingerprint
`f5d40d61361a507e4ef0991c6017700aeaf50949d9b27f6eab3a33fb924b2148`.
It snapshots SQLite with `VACUUM INTO`, verifies locally and archives through
rclone crypt. The live implementation and observed records corroborate the
[recovery runbook](../../infra/recovery.md); its wider target design is not a
claim that every store is protected today.

| Store / consistency group                                                                         | Current generation and observed protection                                                                                                                                         | Operational owner / remaining evidence                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WBS prod, WBS dev, AIVN dev and AIVN CMS SQLite                                                   | Hourly set `20261111T051700267Z`; completed 05:25:51 UTC. All four remote objects exist with recorded sizes.                                                                       | h1claw backup service / h2 application operator. Named human recovery acceptance and RPO/RTO remain unassigned here.                                        |
| h2 deployment state, Compose/Caddy site definitions and environment files                         | Fifth member of that same set: config tar, 12,509 bytes, recorded 58 members; remote size matches. This includes registry auth file, not registry image content or TLS volume.     | h1claw backup service / deploy operator. No fresh tar extraction or cross-file consistency/secret restore proof.                                            |
| MLflow SQLite                                                                                     | Daily `20261111T023700281Z`; completed 02:42:04 UTC; remote object 905,199,616 bytes matches report.                                                                               | h1claw MLflow backup / observability operator. Current artifact-tree completeness beyond SQLite unverified.                                                 |
| Website SQLite                                                                                    | Separate `sqlite/website-dev/20261111T052301331Z.sqlite` plus report are present; 475,136 bytes. Report names `website-sqlite-restore/2` and an object version.                    | Website backup owner. Report/source, live writer, retention-journal/erasure compatibility and independent restore acceptance were not joined in this slice. |
| WBS registry image data; Caddy TLS and autosave volumes                                           | Live `wbs_registry_data`, `wbs_caddy_data`, `wbs_caddy_config` mounts confirmed. They are not members of the inspected h1 hourly/daily sets.                                       | Release/edge owner must supply another protected generation or record a gap. Existing image presence is not recovery proof.                                 |
| Host telemetry, Vector buffers, Netdata stores and h3 Elastic/Prometheus/Grafana/legacy telemetry | h2 persistent mounts captured. h3 Docker inspection unavailable to the audit account. No current per-store protected generation established.                                       | Observability owner; application-consistent snapshots, history policy and restore evidence remain required where retention is promised.                     |
| Cluster state/PVCs and recovery secrets                                                           | h4 k3s server and h3 agent are active; h4 server DB path unreadable and Docker unavailable. No inference about etcd vs SQLite, claim inventory, Velero status or backup freshness. | Cluster/storage owner must supply authorized current inventory and per-store receipts. Service status is insufficient.                                      |
| MCP sessions/keys; assistant state and external provider configuration                            | Historical WBS dev MCP path absent; that does not prove no store exists elsewhere. Assistant/account/key restore custody was not inspected.                                        | Application/assistant/account owners must identify current stores, compatible keys and independent recovery custody.                                        |

Fresh remote listings found all **six** latest encrypted members (five hourly,
one MLflow) with recorded sizes. This does not freshly verify remote content hashes.
The November 8 drill records downloading and hash/size/integrity/sanity verification
of all five then-current hourly members in **531,866 ms**, and MLflow in
**87,600 ms**. It did not put the service into production or prove a full-service RTO.

Retention last completed November 11 04:50:00 UTC, with `ok: true`, `dryRun: false`,
covering encrypted hourly, MLflow and the plain website prefix. The global record
lives under the SQLite root; the absence of a separate MLflow retention JSON does
not contradict that global record. All five backup-related timers are active.
The 05:47 health record is healthy with no alerts; this audit sent no alert.

The installed storage and crypt credential files were readable by the existing
operator and mode `0600`. Values were neither printed nor copied to the repo.
Their use successfully listed the encrypted store. **Independent escrow and a
second credential/copy owner were not proved.** Current object lock, off-region/
off-account protection and provider retention enforcement were not queried.
Do not infer them from a version identifier, encryption or a successful prune job.

## Concrete next release scope and prerequisites

The smallest implementation scope is **bind Compose release acceptance to the
exact image/source/verification chain for every selected tier**, reusing the
existing registry reader and strict gate/source checks. Keep this independent of
the much larger registry lifecycle activation and full recovery program.

1. Add failing production-path cases for absent/wrong image `WBS_SHA`, tampered
   manifest/config digest, wrong frontend revision, missing/failed/cancelled or
   wrong-source gate evidence, and stale executor. Require refusal before swap
   effects and watch each changed check fail under its injected fault (R5).
2. Preserve W02's repaired backup/scheduling and W04's enforced merge checks;
   refresh their applicable release evidence without reopening the completed
   repairs. Select an exact accepted main SHA after the identity repair. The examined baseline
   `7614ca5…` is **not an accepted candidate**: its push run has successful pixels
   and a failed aggregate gate/remote gate. The recorded remote failure is the
   supervisor installer test receiving exit 143 instead of 0; this audit did not
   diagnose or retry it. [Exact CI run](https://github.com/Prosperous-Unification/puni-00/actions/runs/42880292473).
   Current main rules still require `gate` and `pixels`, integration 15368,
   with zero required approvals and no strict update requirement. No rules changed.
3. Use a clean isolated build/gate checkout, leaving the dirty legacy tree intact.
   Run `bin/h2puni-gate.sh <accepted-full-sha>` under its canonical heavy lock,
   retain the printed actual SHA and complete gate output, and retain exact CI/
   browser evidence. Current h2 root free space was about 13.5 GiB; capacity and
   publish admission must pass without cleanup of retained state or bypasses.
4. Reconcile current required environment **key names/rules**, installed executor
   provenance, solver supervisor/MCP prerequisites and the live read-only migration
   ledger against the [first-product deploy procedure](../../runbook-prod-deploy.md).
   Use its no-prod-release override only if the fresh ledger is exactly its
   permitted skeleton. Preserve all interruption/owner markers. Unknown guards
   or compatibility refuse; ordinary post-exposure snapshot restore is forbidden.
5. Through `bin/publish-release.sh`, build once from that accepted SHA. Preserve
   complete release.json bytes/hash, build/toolchain receipt and each manifest/
   config/application label. Include be/gw/fe, explicitly account for the default
   MCP image and intended deployment scope, and hash the matching executors.
   A deploy advisory plan is not a verified runtime or executed preflight.
6. Present those exact candidate digests, gate, backup/key readiness, migration
   plan, executor identities, maintenance/recovery limits and commands for separate
   production installation/deployment authorization. After an authorized release,
   reread live routes and every tier's image/source/gate join plus smoke before
   closing W03. Keep W10 open until each supported store's recovery is accepted.

The managed registry catalog is absent on this host. The source runbook's opening
staging notice and compatibility tests keep the ordinary supported CLI separate
from dormant managed adapters. Missing catalog is not authority to install an
empty one, activate lifecycle machinery or bypass a future managed prerequisite.
See [supported CLI fixture](../../../tools/tool-deploy/src/legacy-delivery.test.ts)
and [runbook staging notice](../../runbook-prod-deploy.md).

This packet completes the selected **diagnosis and replacement preparation**.
It grants no release acceptance, deployment permission, complete-backup claim or
closure of W03/W10. The implementation above still needs its OpenSpec/TDD slice;
building, installing, deploying and invasive recovery drills were not executed.
