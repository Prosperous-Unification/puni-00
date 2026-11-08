# Registry consumer installation and recovery

**Source staging — 2026-11-08:** Registry lifecycle libraries and manual provisioning
sources are retained for future coordinated activation. Supported publish, copy,
Compose and Kubernetes commands keep current-main routing and legacy persisted
writer versions; they do not select managed adapters. Explicit managed helpers
require trusted enrollment. Historical installed receipts below do not establish
current readiness. Managed procedures remain attended future operations; this
source merge performs no installation, adoption or production action. Full native,
provider, storage, backup, isolation, recovery and delivery acceptance stays open.

This is the installation contract for the staged bounded-registry tools. It does
not declare an existing product adopted. Task11 installs the reviewed artifacts,
trusted configuration and source access together; product image migration remains
separate. Keep the current Flux holds and product pins until that activation.

## Select management before rolling out tools

Every execution host needs `/etc/puni/registry-deployments.json`, a canonical
root:root regular file, mode0644, one link, at most64KiB. Missing, unreadable or
malformed state refuses. A deliberately installed
`{"schemaVersion":1,"managed":[]}` permits unmanaged workflows. Never use an empty
catalog to conceal an adopted environment.

Each managed entry contains `authority` (normalized host and optional port),
`registryId`, `product`, `environment`, `target`, and `enrollment:{path,sha256}`.
`publication:{path,sha256}` additionally pins that product's publication contract.
The hashes cover UTF8 `JSON.stringify` of the parsed enrollment. Each enrollment
file has the same root ownership/mode/link/size requirements. Environment selectors
may choose matching entries; they cannot replace the catalog or remove selection.
A managed authority without the matching target/product enrollment refuses.

A deployment enrollment contains `registryId`, `registryUrl`, `owner`, `product`,
`environment`, `target`, `sshHost`, `requiredRepositories` and absolute
`publicationReceiptPath`. The receipt is the complete already-uploaded bundle,
including every repository/digest, root, publisher owner, product, operation ID
and completed receipt. Targets bind actual execution identity: Kubernetes uses
`k8s:<cluster-uid>/<app-namespace>/<backend-namespace>`, Compose uses
`compose:<absolute-root>`, and the private website uses `flux:website-dev`.
Publication enrollment also supplies the independently bounded builder scratch
contract described in [registry operation](registry.md#managed-publication--staged-integration).
Its optional Docker identity pins `{path,sha256}` for the private native exporter.

## Install one compatible artifact set

Build the public `tool-fleet:build`, `tool-deploy:build` and
`tool-remote-scripts:build` targets with the repository's locked Bun toolchain.
Record source commit, Bun version and SHA256 of each installed bundle. The private
website `website-deploy:build` and fleet checks use their pinned Bun1.4.2; do not
update their baseline or copy licensed private source into public bundles.

| Owner                      | Bundled entrypoints                                                                                                        | Contract                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Public authority/lifecycle | `registry-journal-cli.js`, `registry-lifecycle-cli.js`                                                                     | Existing SSH journal authority; lifecycle JSON stdin `registry-lifecycle/1`                          |
| Public desired Git         | `registry-flux-reader.js`                                                                                                  | Clean exact revision, configured origin/ref/roots and pinned kubectl renderer                        |
| Public Kubernetes          | `registry-reader.js`, `registry-history-reader.js`, `registry-history-cli.js`                                              | Actual API discovery, immutable cluster/namespace UIDs, owner journals and explicit genesis/transfer |
| Public host consumers      | `registry-docker-consumers.js`, `registry-compose-consumers.js`, `registry-compose-reader.js`, `registry-solver-reader.js` | Actual desired/runtime/idle refs; owner history; installed solver image map                          |
| Source host dispatcher     | `registry-reader-host.js`                                                                                                  | Fixed authenticated transport to a source-owned reader                                               |
| Private website            | `release-pin.js`, `registry-reader.js`                                                                                     | Private product mapping, owning Git receipts, pending desired edits and verified completion          |

Only the private `publish-docker` child receives explicit `REGISTRY_USER` and
`REGISTRY_PASS`; other lifecycle commands receive neither. Loader variables remain
excluded for every command. Credentials are not artifact configuration or receipts.

The website's fixed `/etc/puni/registry-lifecycle.json` is root:root0644, one link,
canonical and <=64KiB. Its shape is
`{schemaVersion:1,protocol:"registry-lifecycle/1",bunVersion:"1.4.2",artifact:{path,sha256}}`.
The client snapshots the exact hashed public bundle, bounds stdin/stdout/stderr,
and kills/reaps its process group on failure. Missing artifact, hash drift,
unknown protocol or runtime mismatch refuses. There is no sibling-source or
unpinned executable fallback. Only SSH identity/home and explicit registry
selectors cross the subprocess environment boundary; loader options do not.

`resume` is read-only: complete binding validation requires an existing operation.
Only an already-promoted operation matching current authority history returns a
promotion receipt. Pending/recovery-required remain non-successful; reconciled
is not promotion. This lets an owning journal repair a lost local write without
repeating deployment effects or changing the authority. It is not a success-import
endpoint. Schema3 `finish-publication` accepts completed, failed or reconciled
abandoned publication, never promoted. Abandoned partial content remains protected
until its separate reconciliation/release.

## Register the complete source universe

Install root-owned `/etc/puni/registry-consumers.json` on the authority:
`{schemaVersion:1,registryId,sources:[...]}`. Every source has `id`, `owner`,
`environment`, `kind`, absolute `source`, `configurationSha256`, and `role`.
The requested enrollment must equal this complete independently trusted universe;
callers cannot omit a source. Every managed environment requires explicit history
sources and actual consumer-role sources. A history-only environment refuses.

At each source path install a root-owned reader configuration containing
`schemaVersion:1`, `protocol:"registry-consumer/2"`, `registryId`, `id`, `kind`,
`source`, `role`, `artifact:{path,sha256}`, and the source-owned `input` contract.
The authority pins SHA256 of the parsed configuration's JSON representation.
Kinds are flux, kubernetes, compose, solver, recovery, private-product and docker-host. Report
identity, exact source and current authority-operation revision must match; the
reader computes `sourceRevision` from what it actually read. Unknown/missing or
unreadable sources never become empty inventory. Output and execution are bounded;
private snapshots are removed after the child and its descendants are reaped.

For the private website history reader, `source` is the absolute registered reader
configuration JSON path, repeated exactly as `input.configurationPath`. Its separate
`input.ownerSource` is the absolute owning Git directory `<fleet>/apps/website-dev`.
The other input fields are `registryId`, `product`, `environment`, `target`, and
`configurationSha256` (the hash of the independently installed
`/etc/puni/website-registry.json`). The universe registration hash pins the reader
configuration; the input hash pins the owner configuration. They are distinct. The
reader verifies the actual clean Git source against that owner configuration and
requires its actual owner directory to equal `ownerSource`; its report preserves the
registered configuration identity. Install and pin both bindings together; older
private reader inputs missing either field refuse. The wire protocol remains
registry-consumer/2, so refresh the private artifact and its configuration hash
together before enabling the registration.

Consumer-role reports contain exact image references. History-role reports also
contain complete ordered successful bundle IDs, current references and
`historySha256`: the shared public canonical digest of ordered bundle IDs, sorted
exact refs and original promoted receipts. Release order and timestamps remain
significant. Empty history has an explicit digest. Consumer-only readers omit
history. All required history authorities must agree with each other and the
journal; post-promotion/pre-local-persistence disagreement blocks new ownership
and retirement while authenticated terminal retry remains available.

History proves provenance; it is not a permanent live image reference. History
readers retain unresolved recovery obligations in `references`, while completed
history remains in `history`/`currentReferences`. Desired, runtime, stopped/idle,
scaled-zero, Job, init/ephemeral-container and image-volume refs come from actual
consumer readers. Environment protection independently retains current plus two
prior successful bundles. Retirement requires zero actual environment references,
no unresolved operation and matching complete history; it removes only that
owner/environment's protection. Retained source/control records remain readable.

Flux readers use a clean exact Git revision, canonical local roots and the pinned
renderer. Child image/patch transformations are applied. Foreign sourceRefs need
separate enrolled sources; unsupported postBuild/decryption, mutable remote
bases/components/plugins and unknown selectors refuse. Known Helm releases use
their vendored chart/source/version and strict values decoders; valuesFrom,
post-renderers and chart substitution refuse. Unknown populated Kubernetes kinds
also refuse. Discovery visits every advertised served API version, including
nonpreferred versions; duplicate representations contribute to the same image set
and never justify skipping a version. Missing or inconsistent discovery refuses.
Empty unsupported kinds are not evidence that future instances are safe.

When source files are on another host, configure the reader's fixed SSH transport
`{kind:"ssh",host,dispatcherSha256}` and install the complete matching configuration
in that host's root-owned `/etc/puni/registry-readers.json` (`{schemaVersion:1,readers:[...]}`).
The fixed command is `/usr/local/bin/bun /usr/local/libexec/puni-registry-reader-host.js`
as `puni-registry-reader`, using `/etc/puni/registry-reader-key` and
`/etc/puni/registry-reader-known-hosts`, strict host checking and no ambient SSH
configuration. Configure a forced-command account with only the explicit source
read access. Authority UID59001 need not read product-host files directly. Pin the
dispatcher bytes and exact complete configuration at both ends. Installed SSH
access is a Task11 prerequisite; local protocol proofs do not establish live access.

## Initialize or transfer owning history explicitly

Never hand-create an empty history JSON to adopt an existing release. For Kubernetes,
install root-owned `/etc/puni/registry-history.json` with one exact target entry:
`{kind:"kubernetes",target,firstStartPath,releasePath,source}`. Source is the actual
Kubernetes reader contract: pinned renderer/kubeconfig, context, cluster UID,
namespace names/UIDs, registry URL and mandatory `releaseRecord` naming
`wbs-release` in the backend namespace. Credential execution plugins refuse.
The first-start parent directory must be canonical, owner0700. Send JSON stdin:

```json
{
  "protocol": "registry-history/1",
  "command": "initialize",
  "target": "k8s:<cluster-uid>/wbs/wbs-solver"
}
```

The CLI selects the trusted enrollment, observes actual empty namespaces and
absence of prior release ConfigMap/Lease evidence, then exclusively creates and
fsyncs the owning first-start genesis. Existing, unknown, missing or unreadable
history is not reinterpreted. After verified first-start completion, `command:"transfer"`
seals the immutable source/authority receipt linkage before creating the regular
release journal. Retry is idempotent; a recorded transfer makes its destination
mandatory forever. Deleting that destination cannot restart first-install.

Regular release writer4 and first-start writer3 preserve explicitly unmanaged
legacy recovery readers3 and2 respectively. Managed mode requires the current
binding/version; deleting or downgrading it refuses before effects. Schema1/2
release recovery remains refused. Owning history and authority evidence are bounded;
overflow refuses instead of silently truncating release/recovery evidence.

For Compose, the history configuration entry is `{kind:"compose",target,source}`
with its complete pinned Docker/root/prefix/site/edge reader configuration.
Initialization runs under the existing deploy lock and embeds history in the
existing backend state. It preserves color/phase/recovery marker semantics.

For website, install root-owned `/etc/puni/website-registry.json` pinning exact
fleet path/origin/branch, registry URL/repository prefix, cluster/namespace UIDs,
kubectl/kubeconfig hashes, Flux source/Kustomization identities and live-check
hosts/mode. Review the independent fleet `apps/website-dev/registry.json` mapping.
Then use `release-pin.js initialize-registry <fleet>`; it requires the known
placeholder-only immutable Git genesis and an actually empty namespace. Pre-authority
product history without complete existing trusted promoted journal bundles cannot
be adopted by this slice. No fabricated promotion timestamps or general history
import are provided.

## Complete or recover consumers

Kubernetes cutover export/restore/release CLI guards before export execution or
emitting usable manifests. First-start resumes that same durable operation and
promotes only after existing readiness and Flux handoff. Regular release failure
keeps original/candidate/current refs and unresolved recovery ancestry. Explicit
verified recovery alone reconciles the chain; unrelated owners remain protected.

The Compose desired-source reader supports the checked-in production base and the
service-free dev base (explicit name and networks). Every tier override must still
contain a services mapping; arrays, unknown selectors and unsupported top-level
fields refuse. A service-free base does not imply empty tier consumers.

Managed Compose requests must name all three configured be/gw/fe consumers from
one complete four-image WBS publication (including mcp). There is no added MCP
service and no automatic expansion of a subset. The same whole-environment lock
covers protection, tier commits, exact active/running refs, and shared smoke.
Install `/etc/puni/registry-compose.json` as root-owned configuration containing
`schemaVersion:1`, `docker:{path,sha256}`, `host:{machineId,catalog:{path,sha256}}`,
and `smokeSha256`; smoke bytes at
`<root>/bin/smoke.js` are pinned before mutation. Smoke preserves per-tier colors,
network/root, server secret files and optional read-account semantics. Failure
keeps candidate/outgoing protection and does not auto-rollback. Complete-candidate
retry reruns verification/smoke without reswapping tiers or rerunning migrations.
The local managed command consumes the verified remote receipt instead of running
an unbound second smoke after unlocking.

The attended backend recovery diagnostic requires an already durable matching
whole-environment unresolved operation in managed mode. Under the deploy lock it
checks fresh authority ownership/protection and exact previous/candidate backend
refs before any probe. It never creates partial ownership, promotes, reconciles
or releases it. Success/failure/cancellation retain that operation. Existing
stopped-writer/database/replay checks still apply.

Website pin/rollback only commit desired Git and retain pending ownership. Push
remains an explicit reviewed action. `complete-registry <fleet>` requires exact
applied Flux revision, current Ready generations, all three exact-image available
Deployments and existing live checks before promotion. `recover-registry <release>
<fleet> <operation-id>` explicitly links an interrupted operation; the interrupted
candidate is not invented as successful history. Rollback carries complete managed
receipt history into the surviving receipt. Lost local persistence after verified
promotion uses read-only resume to repair the original receipt before further
ownership or retirement.

## Separate Docker host coverage from environment ownership

Register a `docker-host` consumer with `environment:null` and `role:"consumer"`.
This is explicit registry scope, never a synthetic environment. Each Compose
actual-consumer registration has `hostSourceId` naming that global source.
Enrollment refuses missing global coverage. Collection additionally requires
matching machine, ownership-catalog, Docker executable and transport identities;
matching an ID alone is insufficient. A global source cannot supply an
individual environment's history or actual-consumer coverage.

The global reader input is `{registryId,registryUrl,docker,host}`; `docker` is the
pinned native executable and `host` is
`{machineId,catalog:{path,sha256}}`. The root-owned catalog has
`{schemaVersion:1,registryId,machineId,environments:[...]}`. Each environment entry
contains `owner`, `product`, `environment`, `target`, canonical `root`, `prefix`,
explicit Compose `project`, and `containers:[{name,service}]`. Include all six
configured be/gw/fe blue/green names and any separately retained owned containers.
Names, environments and roots cannot be ambiguous. The hash covers parsed JSON;
the actual `/etc/machine-id` must match. Do not infer ownership merely from a name
prefix. Exact container name and Compose project/service/working_dir labels must
agree with the installed entry and its root.

Compose source input includes that same `host`, a complete
`scope:{registryId,owner,product,environment,target}`, its root/prefix/site/edge,
registry URL and Docker pin. `/etc/puni/registry-compose.json` also contains the
shared `host` alongside its Docker/smoke hashes. The global reader enumerates ALL
containers, including stopped and unknown names, and retains all managed refs.
Unmapped or ambiguous managed ownership refuses complete inventory/destructive
maintenance. The environment projection selects only verified ownership plus
literal desired files under its enrolled root. A different environment's active
or stopped images therefore remain globally protected without inventing prior
history for a fresh environment or preventing retirement of an empty one.

Install this coordinated reader/schema set together: old reader protocols or
configurations lacking the host linkage refuse. Existing schema2 journals upgrade
explicitly to schema3 before any source enrollment; no legacy source coverage is
inferred. `registry-docker-consumers.js` is packaged with the remote scripts.
