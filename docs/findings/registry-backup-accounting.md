# Registry backup accounting

Research on 2026-11-01 for [Task 4.3](../../openspec/changes/bound-registry-storage/tasks.md).
The research below is protocol/source evidence. The implementation continuation
records controlled local transport evidence; neither establishes a provider
experiment, billing guarantee or installed runtime proof. The separate 100 GiB admission goal, seven daily/four weekly coverage, recovery pins,
last verified snapshot and isolated post-prune restore remain required and incomplete.

## Approved budget measure — 2026-11-04

The user clarified: "100 GiB limit is ok just count using the files". The registry
backup budget therefore counts the listed stored sizes of backup objects, their
retained versions and uploaded multipart parts. Restic metadata files count as
files; provider metadata charges, minimum billable sizes and billing rounding do
not count. The authoritative contract is in the
[backup design](../../openspec/changes/bound-registry-storage/design.md#backups-and-monitoring)
and [delta spec](../../openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md#requirement-backup-budget-measure).

REG-B1 is resolved by this explicit change of accounting basis. The historical
billing research and unsent support draft below are not admission prerequisites;
no Hetzner answer or outbound contact is needed for the selected measure. The
existing signed census already returns `payloadBytes` for object versions and
uploaded parts with `accounting: 'payload-only'`, which matches this measure.
A census alone does not prove the complete admission/reservation implementation.
New encrypted files, restic metadata files, repeated writes/versions and temporary
prune coexistence still need conservative reservations; incomplete listing,
unknown additions, missing retention coverage or unproved local workspace must
refuse. The native/installed storage and complete lifecycle proofs remain open.

## Historical provider billing research

The user confirmed on 2026-11-01 that `puni-01/backups/registry/restic-v1` is a
Hetzner bucket. The explicitly approved installed-configuration observation below
binds its legacy runner to `hel1.your-objectstorage.com`, bucket `puni-01` and
prefix `backups/registry/restic-v1`. Versioning and immutable repository identity
remain unverified. The [registry runbook](../infra/registry.md) names the prefix;
public [recovery documentation](../infra/recovery.md#bucket-lifecycle) separately uses
Hetzner endpoints. Bind the eventual trusted configuration to exact endpoint,
bucket, prefix and immutable restic repository ID. Provider identification alone
does not establish the billed-byte formula or authorize live provider access.

Hetzner documents a **64 kB minimum billable object size** and up to 8 kB of
object metadata. Its FAQ distinguishes system metadata, custom metadata and
attributes, while the overview does not explicitly identify which billed components
the 8 kB limit bounds. The reviewed pages establish neither that adding 8 kB to each
listed `Size` bounds total storage nor the minimum's byte conversion. This is an
evidence gap, not evidence that unlisted internal overhead is billed.
[Hetzner overview](https://docs.hetzner.com/storage/object-storage/overview/).
Its FAQ includes previous versions and ongoing/aborted multipart leftovers in used
storage, says metadata is billed, and delays Console statistics by 15–20 minutes.
[Hetzner FAQ](https://docs.hetzner.com/storage/object-storage/faq/general/).

Object/part `Size` totals are a payload census, not a proven billable bound.
Unknowns include version/part/delete-marker minima, metadata and aborted leftovers.
AWS charges delete markers by UTF-8 key length; that cannot establish Hetzner billing.
[AWS delete markers](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeleteMarker.html).
Hetzner explicitly says a dedicated storage/network utilization API is unavailable;
this is provider evidence, not merely failure to discover an endpoint.
[Buckets and objects FAQ](https://docs.hetzner.com/storage/object-storage/faq/buckets-objects/#can-i-check-the-storage-and-network-utilization-via-api).
S3 Metrics/Inventory are also unsupported; delayed Console totals cannot prove admission.
[Compatibility](https://docs.hetzner.com/storage/object-storage/supported-actions/).
Obtain a provider-owned contract or verified conservative bound; unknown stays blocking.

A bounded additional search on 2026-11-01 covered official pricing, terms, policy,
lifecycle and testing-repository sources. None established the complete conservative
translation or which billed components the metadata limit bounds. Repeating that
public-source scope is not a productive next step without new evidence. No live
bucket or billing API was queried; the signed census remains explicitly payload-only.

## Endpoint discovery — 2026-11-02

The [recovery runbook](../infra/recovery.md#bucket-lifecycle) uses
`https://hel1.your-objectstorage.com` in bucket-management commands. This is a
concrete candidate, not a verified binding to the registry's installed restic
repository. The [registry runbook](../infra/registry.md#recovery-custody) identifies
`puni-01/backups/registry/restic-v1`; joining those two references cannot establish
the exact live endpoint, versioning or immutable repository ID.

The staged backup unit runs the dedicated authority UID and delegates provider
access to the fixed root helper; it exposes no environment-file endpoint. The
[installation runbook](../../infra/systemd/registry-backup/README.md#installation-boundary)
places the repository URL inside a root-only backup configuration with provider
credentials. Reading that whole file is unnecessary for configuration discovery:
a later authorized observation should emit only the endpoint hostname, bucket,
prefix and repository ID after validating the expected schema, never credentials
or the complete environment. No such protected-file observation occurred here.

The approved non-root installed-unit metadata observation subsequently located
`EnvironmentFiles=/root/.puni/registry/backup.env` on identity-verified h4claw,
with `ignore_errors=no`. No environment value or referenced file was read. This is
the installed older runner's configuration reference, distinct from the staged
new helper's `backup.json`. A future separately scoped observation can extract
only repository endpoint/bucket/prefix fields; the reference alone proves none of
their values. `LoadCredential` was rendered as unprintable and remains unverified.
Evidence: `/tmp/registry-h4-metadata-observation-20261102.json`.

### Prepared endpoint-only extraction — historical approval boundary

A fixed read-only parser is prepared at
`/tmp/registry-repository-observe-20261102.py`. Its pure parser passed22 synthetic
cases without disclosing a fake credential. It accepts only the exact known
registry bucket/prefix and three known Hetzner endpoint hostnames; unexpected
configuration produces a fixed refusal message. It neither evaluates shell input
nor contacts the provider. The remote boundary fixes the machine identity and
file path and checks owner/mode/type/link/size before reading. Those remote and
metadata boundaries have not been exercised or certified by the parser fixtures.

Automatic approval review rejected its execution because reading a credential-bearing
file via root exceeded the existing non-root metadata authorization, even with
allowlisted output. No remote command launched, protected file was read or alternate
route tried. Explicit user approval for this exact extraction is pending. Receipt:
`/tmp/registry-repository-extraction-request-20261102.json`. The prepared reader
resolves execution scope; its preparation does not establish the actual endpoint
or a provider accounting guarantee.

## Provider clarification draft

Local draft for provider review; it has not been sent. No account access or
outbound contact is authorized by preparing it. An answer must identify the
applicable service/accounting scope; a payload-only example is insufficient.

> We need a conservative stored-byte accounting rule for an S3 bucket/prefix
> before admitting backups under a 100 GiB (107,374,182,400-byte) limit. Please
> provide provider-owned documentation or a written upper bound covering these
> points:
>
> 1. What exact byte units, minimum object size and rounding apply, including
>    objects above the minimum? Distinguish instantaneous stored bytes from hourly
>    billing aggregation and any minimum billed duration.
> 2. Which system/custom metadata and attributes are billed? What does the stated
>    8 kB metadata limit bound, and does metadata combine with payload before or
>    after the minimum-size calculation?
> 3. How do the rules apply to current/noncurrent and null versions, directory
>    markers, delete markers, multipart-upload records and individual uploaded
>    parts, including aborted leftovers? State any category-specific minimum.
> 4. Can complete ListObjectVersions, ListMultipartUploads and ListParts responses,
>    plus bounded metadata observations, account conservatively for every category
>    while writers are excluded? If some charged residue is not visible there,
>    what provider-owned bound covers it?
> 5. When do exact-version deletion and multipart cleanup release accounted
>    storage? Please distinguish API acknowledgement, observed absence and the
>    delayed Console statistics.
>
> A conservative overestimate is sufficient. Please state the formula's complete
> assumptions and whether it bounds the stored-byte measure used for billing;
> we do not need a prediction of account-wide monetary charges.

A provider response is evidence to evaluate, not automatic admission authority.
Bind an accepted rule to the trusted endpoint/bucket/prefix/repository configuration,
implement its translation, and prove budget refusal before enabling grants. The
adapter remains closed while that evidence and implementation are incomplete.

## Complete S3 census

Use delimiter-free, prefix-scoped requests so `CommonPrefixes` cannot hide descendants.
Keep decoded key identity separate from wire encoding. AWS documents `encoding-type=url` for XML-unsafe keys.
[Version API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html).

| Operation              | Evidence and continuation                                                                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListObjectVersions`   | Enumerate every `Version` and `DeleteMarker`; retain `Key`, exact `VersionId`, `IsLatest`, and each object's nonnegative `Size`. Both current and noncurrent objects count. Continue truncated general-purpose-bucket pages with returned `NextKeyMarker`/`NextVersionIdMarker`. |
| `ListMultipartUploads` | Enumerate each `Key`/`UploadId`, including separate uploads sharing a key. Continue with `NextKeyMarker`/`NextUploadIdMarker`; this response has no aggregate part bytes.                                                                                                        |
| `ListParts`            | For EVERY observed upload identity, enumerate every `PartNumber`/`Size`; continue with `NextPartNumberMarker`. Validate returned bucket/key/upload identity.                                                                                                                     |

Contracts: [versions](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html),
[uploads](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html),
[parts](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html).
Each call returns at most 1,000 entries; page length is not proof of completion. AWS permits zero `Part` elements. The SDK's response collection fields are optional,
so absent repeated-element collections can represent empty XML collections.
[AWS model source](https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-s3/src/models/models_0.ts).

Boundary policy: normalize only such protocol-defined absent collections after
validating the response/root, scope and explicit truncation state. Do not normalize
missing object size/identity, malformed arrays, unreadable pages, XML parse failure or
missing trusted configuration. AWS explicitly warns that versions may return invalid
XML with HTTP 200; SDK command fulfillment is insufficient completeness evidence.
[Version API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html).

Next markers need not exist on final pages; initial request markers can be absent/empty.
Multipart upload-ID continuation is unsupported for AWS directory buckets; exclude
that backend profile here. Do not require every optional response field globally.
For a truncated supported-profile page, consume the documented continuation tuple;
if no unambiguous, progressing continuation exists, refuse rather than infer it from
the final key. Do not sort opaque version/upload IDs to manufacture progress.
[Upload API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html).

Bound pages/count/bytes/time, reject duplicate identities/repeated cursors and require
stable scope/writer exclusion; S3 pagination does not establish an atomic snapshot.
Track versions/markers/uploads/parts independently. Abort success proves no reclaimed bytes: AWS warns in-flight parts may survive and requires `ListParts` confirmation.
[AWS abort API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
A disappearance/404 during census requires modeled reobservation, not a zero default.
An authenticated empty versioning configuration means never-enabled versioning,
whereas `Suspended` can retain history; distinguish these from failed observation.
[AWS versioning API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html).

Hetzner's own cleanup guidance lists ongoing **or aborted** uploads, then their
parts. This supports the uploads/parts census strategy; it proves neither billed
size nor complete live visibility/reclaim timing.
[Provider multipart guidance](https://docs.hetzner.com/storage/object-storage/faq/buckets-objects/#how-do-i-delete-leftover-parts-from-an-aborted-multipart-upload).

## Restic 0.19.1 and physical reclamation

Source-shape, encrypted payload, retry and local/prune resource derivations are
recorded in [source and workspace bounds](registry-backup-workspace.md). Those
conditional formulas are not implemented admission authority.

Pinned source separates `forget` (snapshots) from `prune` (unreferenced content).
Daily/weekly policies select periods containing snapshots, can overlap, and combine
with OR; they cannot invent missed recovery points. Default grouping includes host
and paths, so registry storage-path changes require deliberate coverage grouping.
Repack writes precede obsolete-file deletion. `--max-repack-size` limits selected
files; `--max-unused` tolerates unused content, not peak storage. Even
`--max-repack-size 0` requires scratch; the unsafe no-space mode weakens interruption
safety and must not become automatic recovery.
[0.19.1 retention/prune documentation](https://github.com/restic/restic/blob/v0.19.1/doc/060_forget.rst).

The pinned [prune implementation](https://github.com/restic/restic/blob/v0.19.1/internal/repository/prune.go)
rebuilds indexes after repacking. Neither repack selection nor dry-run output is a
documented total bound for new index objects, pack/encryption overhead, multipart
residue, local memory/scratch or provider billing. Derive and prove those independent
envelopes; unknown workspace keeps admission closed.

The pinned [S3 backend](https://github.com/restic/restic/blob/v0.19.1/internal/backend/s3/s3.go)
lists current objects and removes keys with empty `RemoveObjectOptions`, without an
explicit version ID. On version-enabled S3, simple deletion adds a delete marker;
physical old versions remain. Thus restic repository usability on that backend does
not prove physical prune reclamation; interrupted/repeated prune can leave old and
new physical content counted. Suspended versioning also has distinct null-version
semantics. [AWS deletion API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html).

Exact-version deletion must prove ownership/references/pins and recensus actual reclaim;
removing covering markers can expose old content. Raw lock recovery additionally needs
version-specific GET, ciphertext SHA-256/key matching and immutable repository currentness,
as required by [its existing port](../../tools/tool-fleet/src/registry-backup-locks.ts).
Hetzner lists conditional PUT/DELETE on versioned buckets as unsupported;
do not assume AWS conditional-delete concurrency protection exists there.
[Hetzner compatibility](https://docs.hetzner.com/storage/object-storage/supported-actions/).

## Authenticated transport implementation

Installed `bun-types` 1.4.2 `s3.d.ts` exposes visible-object listing and file presigning, with no arbitrary signed query/versions/parts interface.
The [Bun documentation](https://bun.com/docs/runtime/s3) and
[official declarations](https://github.com/oven-sh/bun/blob/main/packages/bun-types/s3.d.ts)
provide no supported raw-operation signer here. Appending query parameters to an
existing signature is not an established transport. The SQLite adapter's visible-key
store cannot supply Task 4.3's census.

The implementation now pins official `@aws-sdk/client-s3` **3.1161.0** and uses
its signing and modeled operations; `send(command, { abortSignal })` supports cancellation.
[AWS client source](https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-s3),
[AWS cancellation contract](https://aws.amazon.com/blogs/developer/abortcontroller-in-modular-aws-sdk-for-javascript/).
`registry-s3-census.ts` supplies explicit endpoint/region/static credentials,
disables ambient SDK discovery/retries/redirects, and bounds requests, streamed
response bytes, records and cancellation deadlines. Strict XML validation rejects
malformed or missing scalars before SDK normalization. Pagination accepts supplied
opaque version/upload cursors, including unreturned identities; exact response
scope/echo, key direction, cursor cycles and duplicate identities remain checked.
Versioning must be enabled. Exact-version GET and DELETE require matching response
identity; body cancellation and SDK cleanup are awaited. Deadlines initiate abort;
they do not guarantee a hard return time if cleanup itself is delayed.

The root raw-lock adapter rechecks canonical held maintenance authority before
every request, shares one deadline across complete census/lock reads/bookends,
hashes every current/history lock ciphertext and verifies its size/name. Exact
deletion accepts only a fresh visible lock identity and requires a complete
recensus. The existing dead-attempt reconciler remains responsible for ownership
and independently proven origin exclusion. Controlled Request/Response fixtures
use the actual SDK, fake credentials and modeled authority ports; they establish
neither real root/kernel-lock authority nor live provider compatibility.
Guard/dependency fault evidence and the pagination review correction are recorded
in the change's [verification record](../../openspec/changes/bound-registry-storage/verify.md).
The census reports `accounting: 'payload-only'`; physical admission remains closed.

A separately pinned AWS CLI is an alternative, not currently configured. It supports these APIs but auto-pagination can aggregate unbounded output; `--no-paginate`
returns one page, requiring an explicit complete loop.
[AWS CLI pagination](https://docs.aws.amazon.com/cli/latest/userguide/cli-usage-pagination.html).
Use only fixed verbs/scope, isolated credential environment, disabled pager/debug,
bounded pipes and the existing authority/deadline/process cleanup. Credentials can
be supplied through environment rather than secret argv.
[AWS CLI environment](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html).

## Remaining implementation and evidence limits

Controlled SDK census and exact-version recovery positives/negatives are implemented.
Read-only retention inspection now matches the complete authenticated restic
catalogue to exact provider snapshot-version bookends, validates durable root pins
and last-verified metadata/journal, and preserves all points when coverage is
incomplete. These prerequisites do not establish under-budget success or physical
prune safety. Under the approved file-size measure, prove complete file accounting
and new-content/prune envelopes before opening admission; a provider billing
contract is no longer required. Preserve
repository/raw-lock verification before prune, shared authority, last-verified
receipt and recovery pins. Implement durable exact-ID retention effect authority,
bounded prune/physical reclamation and independent kept-snapshot restore while
preserving the planned seven daily/four weekly coverage. Task 4.3
remains incomplete.

Original read-only research commands: `sed`/`rg` on named source/Bun declarations/public docs/manifest/lock;
`cat` research skill; `wc -l` draft; `git status --short --` the two owned paths.
Official pages/source were read with web tools. That research performed no secrets,
real-bucket/remote/root calls, installation or runtime tests. The later local SDK
installation, tests and bundle checks are recorded separately in the verification
record; no live provider calls or activation are established by this note.

## Approved installed repository identity — 2026-11-03

The user explicitly approved the prepared reader's extraction of nonsecret
repository identity from `/root/.puni/registry/backup.env`. Its SHA-256 matched
`a846ca9aaa0c9ead88ffdb533cc4f8efa9a24b875bcf438c5e25dfdc7f8dc8bd`
before execution. The earlier automatic-review rejection and pending approval
above are historical; this exact read is now authorized and completed.

The non-root SSH transport's sudo command failed before reader execution, with
zero stdout; its raw stderr was not retained. The identical reader then ran
successfully using the existing `h4` root SSH alias. It checked machine ID
`f592d9aa3f3547d0b08a4b8bdec81012`, root execution and the fixed configuration
file's regular-file, root owner, single-link, mode 0600 and 64 KiB size contract.
At 22:13:10 UTC it returned only these allowlisted values:

| Field             | Observed value                |
| ----------------- | ----------------------------- |
| Endpoint hostname | `hel1.your-objectstorage.com` |
| Bucket            | `puni-01`                     |
| Prefix            | `backups/registry/restic-v1`  |
| Repository syntax | `https`                       |

Receipt: `/tmp/registry-repository-identity-observation-20261103.json`.
The reader parsed the file without evaluating shell input. No credentials or full
configuration were printed or retained; no provider request, backup command,
configuration mutation or service restart occurred.

This binds the legacy installed runner's configured repository URL. It does not
prove live provider reachability, bucket versioning, immutable restic repository
ID, new-runtime enrollment, snapshot integrity or a stored/billed-byte bound.
REG-B2's approval/extraction condition is resolved. REG-B1's deferred Hetzner
accounting contract and REG-B3's native/installed authority and storage-profile
proofs remain unresolved. Physical backup admission remains closed.
