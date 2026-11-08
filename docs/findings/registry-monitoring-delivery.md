# Registry monitoring delivery research

Primary-source research begun on 2026-11-01 for
[Task 5.1](../../openspec/changes/bound-registry-storage/tasks.md).
The configured monitoring route is now verified as `slack-puni` with `#puni-alerts`;
the dated host observations and earlier adoption evidence follow below. The
registry-specific authenticated acquisition path, five-minute missed-source alert
and required destination receipts remain unverified. The incoming-webhook research
below describes a conditional transport contract, not registry delivery evidence.
The local pressure cache is not notification delivery state.

## Nonsecret configuration discovery — 2026-11-02

The checked-in [production inventory](../../infra/ansible/inventory/production-existing-hosts.yml)
identifies h4claw as 10.1.0.4 (platform server) and h3mon as 10.1.0.2
(observability agent). These are declared identities, not fresh host observations.
The inventory records h3mon's existing Victoria/Grafana/OTel containers separately
from Kubernetes workloads.

The [previous registry activation](../../openspec/changes/activate-platform-registry/verify.md#live-activation)
records that the Kubernetes observability, alerts and backup stages had empty
inventories and were held, while independent host monitoring continued. Therefore
`observability/alertmanager-puni` is a declared future receiver source, not evidence
of the active host receiver. The [platform runbook](../infra/platform.md#observability)
and its operator-provided Secret declaration do not select a Slack destination.
The website's ntfy receiver instructions belong to another product and likewise
cannot select the registry destination.

The locally available private fleet checkout at revision
`58831dbb4c62d8d5b425f2423592dd171599bf38` has a nonsecret registry-storage README
that says its resources are staged, not activated. That corroborates the staged
configuration boundary; it does not supply a live receiver or authentication route.
No encrypted/private credential file was opened to establish these findings.

Next observation can be limited to h4claw's hostname, machine identity and named
systemd unit metadata. It needs neither a root shell nor secret contents. This
would establish which reviewed services are installed before requesting any
separate configuration observation. A prepared command and its exact output
allowlist live in `/tmp/registry-host-metadata-request-20261102.md`. The bounded
observation subsequently ran under scoped approval; its outcome follows.
The earlier rejected root proof on 10.1.0.2 remains unapproved and is not retried by
this preparation.

### Installed metadata observed without root

Two approved non-root SSH metadata commands on `puni1@h4claw` exited 0. The
observed machine ID exactly matched the checked-in inventory; the remote UID was 995. The existing backup service is loaded from `/etc/systemd/system`, runs as
root and reported its last execution successful: 2026-11-02 02:37:03–02:37:34 UTC,
exit status 0. Its timer is active/waiting for 2026-11-03 02:37:00 UTC. This
establishes service-manager status, not snapshot integrity or budget enforcement.

The pressure, retirement and alert-sender services, plus retirement and sender
timers, returned `LoadState=not-found`. The new lifecycle remains uninstalled on
this host. A bounded system-service filename search for monitor/alert/health/
watchdog matched only the standard LVM/mdraid units. That search cannot rule out
monitoring in containers, user units, cron or another host, and supplies no receiver
protocol. Evidence: `/tmp/registry-h4-metadata-observation-20261102.json`.

No sudo, secret/configuration contents, logs, remote helper, provider request or
notification was used. No service, timer, cluster resource or product was changed.
The earlier h3mon root-proof rejection remains untouched; these were separately
approved observations of nonsecret metadata on the inventory-identified h4claw.

### Monitoring-host login boundary

The same bounded non-root metadata observation was approved for `puni1@h3mon`,
with the inventory machine ID required before unit queries. SSH returned255:
`Permission denied (publickey,password)` at its reported address62.238.112.126.
No remote command ran and no machine identity was verified. The checked-in private
address remains10.1.0.2; the existing alias's reported transport destination is not
proof of an incorrect host, but the intended route and working non-root account
must be established before further observation. No alternate account/address,
credential retrieval or root operation was attempted. Evidence:
`/tmp/registry-h3-metadata-observation-20261102.json`.

### Live Docker monitoring route — 2026-11-03

The configured `h3mon` alias uses `monitor` (UID 1001), and its machine ID
matched the inventory. This resolves the earlier failed `puni1@h3mon` override;
the account question above is historical. The monitor account cannot read the
Docker socket: its container query exited 1 with permission denied. Using the
user-suggested `h3` root alias for selected container metadata succeeded on the
same verified machine. No stopped proof or remote helper was executed.

The running `puni-dev-observability-alertmanager-1` uses Alertmanager v0.34.0,
with its API published only at `127.0.0.1:19093`. Its selected Compose labels name
an immutable base and a later `compose.slack.json` overlay. The read-only
configuration bind points to
`/home/monitor/puni-dev-observability/releases/slack-18a49644572da5e6f987a249c47c6cf9d927ce08/alertmanager.yaml`.
Only path metadata was read; the configuration contents were not opened.
The accompanying Prometheus container is running with a loopback API at port 19090. Neither held Kubernetes stages nor the older local-only dev configuration
can establish this later overlay's destination.

As the non-root monitor account, `GET /api/v2/receivers` returned one receiver
named `slack-puni`. A bounded metrics read showed one receiver, 138 aggregate
Slack notification attempts and zero in each of the seven exposed Slack failure
counters. The initial broad metrics output was truncated; a second observation
restricted output to the nine Slack/receiver lines and exited 0. These counters
do not identify a channel, establish registry routing or prove delivery of any
required registry event. No notification was submitted.

This establishes an existing independent-host monitoring route to investigate
before adding any new receiver. The actual channel, registry acquisition and
routing, installed authentication, five-minute source-outage behavior and
independently observed destination receipts remain unverified. Evidence:
`/tmp/registry-h3-monitoring-observation-20261103.json`. No environment values,
credentials, configuration contents or alert messages were read or sent, and no
host service or product was changed.

### Loaded policy and earlier adoption

A separate non-root status observation on 2026-11-03 verified Alertmanager v0.34.0,
the `#puni-alerts` channel override, root receiver `slack-puni`, zero child routes
and zero inhibition rules. Group wait is one second, group interval 30 seconds
and repeat interval four hours. Only these allowlisted fields were retained;
credential fields were checked for redaction, and no raw response was saved.
The status API uses typed configuration serialization, and the normal secret-URL
marshaller emits a placeholder.
[API implementation](https://github.com/prometheus/alertmanager/blob/v0.34.0/api/v2/api.go#L162),
[configuration serialization](https://github.com/prometheus/alertmanager/blob/v0.34.0/config/config.go#L281),
[Slack configuration types](https://github.com/prometheus/alertmanager/blob/v0.34.0/config/notifiers.go#L291),
[secret-URL serialization](https://github.com/prometheus/alertmanager/blob/v0.34.0/config/common/url.go#L89).
Evidence: `/tmp/registry-h3-status-metadata-20261103.json`.

The earlier parent verification already records the user's selection of
`#puni-alerts` and the separately gated, versioned Slack adoption on 2026-10-30.
See [versioned adoption](../../openspec/changes/bound-registry-storage/verify.md#2026-10-30-versioned-slack-adoption-completed).
The current observations refresh those facts; they do not discover a new receiver
or establish a new registry delivery receipt. The existing adoption receipt is
`/tmp/task10-slack-adoption-current.json`, with monitoring source commit
`18a49644572da5e6f987a249c47c6cf9d927ce08` and the same running container.
Its controlled notification completion evidence remains distinct from channel
message identity, human visibility and the required registry-specific events.
Source integration into maintained code remained separate at that checkpoint.

### Maintained-source integration — PR 833

[PR 833](https://github.com/Prosperous-Unification/puni-00/pull/833) merged the
receiver-preservation dependency onto main as
`d7070b0133e66c2fcc093a93cf9026e0cfec7289` on 2026-11-03 at 12:09:45 UTC,
without importing the unrelated monitoring ancestors into the registry feature
branch. The reviewed and gated source is
`47be0234c7f8e18b8e882302e51d137857a18a14`, retained on
`fix/registry-monitoring-receiver-20261103`. The clean isolated worktree
`/home/df/.codex/worktrees/1c66/puni-00` now holds the subsequent fixture repair. It preserves `slack-puni`, the selected
channel/recovery policy and the external credential-file reference.

Review found that a host bind-source pathname can name a replacement file while
its container still has predecessor content mounted. The source preflight now
requires a fixed-path checksum through the captured container ID and compares it
with the verified host release. The regression uses real owned file replacement
and modeled Docker observations. Credential verification is a required guard;
the producer serializes only a fixed readiness marker, never a verifier return.
Omitted-verifier and injected-return faults exercise the actual producer/output
statements. These are local source boundaries, not installed-container proofs.

Final local owning checks report 451 tests passing, zero failures, uncached
lint/typecheck/build success, scoped formatting and strict owning OpenSpec success.
Normal hooks ran without bypass; source review and both scoped correction reviews
have no open findings. Seven mounted-content predicate/dependency variants and two
readiness/output variants were watched fail at their intended assertions. The
parent independently checked the current source pins and exact mutation inputs.
Tool Wiki remains explicitly inactive and uncertified.

Remote Python CodeQL analysis `2084276779` at this exact source reports zero
findings; its predecessor `2084138050` at `eb05eaeb9` reported one. The traced
verifier-return expression was removed from serialization without a scanner
suppression or symbol rename. This does not claim the entire CI or host gate is
complete. At the checkpoint, other remote checks were running and the exact-source
h4 canonical gate session remained live after a missing-commit refusal was resolved
by fetching the branch without checkout. The initial exit 64 is retained as a
failed launch, not a gate result.

Subsequently, the full remote workspace/browser CI and CodeQL checks passed at
this exact source. A separate approved read-only installed check confirmed the
checksum utility and its expected empty-input output in the existing container,
then confirmed the normal monitor UID1001 sudo/Docker transport. Through that same
transport, the actual mounted `/etc/puni/alertmanager.yaml` checksum matched the
trusted current renderer. Only checksum metadata was emitted; the external
credential file was never opened. Receipt:
`/tmp/registry-monitoring-installed-checksum-observation-20261103.json`.

The full protected-credential preflight, real predecessor-bind replacement fault,
new helper adoption, registry-specific delivery and independent five-minute
acquisition remain unverified. The default h4 queue later expired after30minutes
with exit75 while the previous gate was still executing CPU-active Bun tests.
One additional canonical attempt used the supported finite 3600-second queue
budget and acquired the lock after 752 seconds. It printed the exact
`47be0234c7f8e18b8e882302e51d137857a18a14` revision. OpenSpec passed 319/319;
the uncached test, lint, typecheck and build batch passed for 53 projects plus
10 dependency tasks in 59 minutes 23 seconds. The separate Twilight batch passed
for both projects plus four dependency tasks in 49 minutes 51 seconds. Both
separate lint phases passed. Solver image smoke passed, including three real-Docker
orphan cleanup tests with 15 assertions across two files. The complete canonical
h4 gate session exited 0; frozen installation and format `--all` also passed.
Tool Wiki remained inactive and uncertified. No lock was bypassed and no source
was checked out before admission. Final gate receipt:
`/tmp/registry-monitoring-gate-final-receipt-20261103.json`; retained log SHA-256:
`4711759695db05b3716b0fc90ebfd8dce43196e573fb8002d3c8d82d884803ea`.

Normal ready/merge commands completed without bypass. An independent post-merge
check found all 15 reviewed files byte-identical to the tested candidate and the
merge patch limited to those same paths. The actual merge parent had gained
17 commits affecting 64 other paths; none overlaps the reviewed paths, and all
are preserved. The preliminary audit's older two-package-name expectation failed
and was corrected against that actual parent; it was not treated as a successful
check. Receipt: `/tmp/registry-monitoring-integration-merge-receipt-20261103.json`.
CodeQL run `41633384696` completed successfully for the merged SHA. Python,
Actions and C/C++ analyses report zero findings. JavaScript analysis `2085507588`
reports 59 findings, identical to the actual merge parent's analysis `2085304182`
by rule, level, exact location and fingerprint multisets; none lies in the
15 reviewed paths. This is an unchanged baseline, not a finding-free repository.
Metadata-only receipt:
`/tmp/registry-monitoring-merged-main-codeql-receipt-20261103.json`.
CI run `41633385782` completed with failure at 13:35:40 UTC. Its sole failed Nx
target was `wbs-be-01:test`: 3904 passed, three skipped and one failed. The delayed
real receiver fixture exceeded its 22000 ms preparation-marker budget at 22110.33 ms.
The exact slow inner CI operation remains unknown. The candidate gate does not
certify this later combined main tree or the dirty registry feature branch.

[PR 839](https://github.com/Prosperous-Unification/puni-00/pull/839) repairs that
ordinary fixture's declared-delay accounting. Reviewed source
`dedc8ca82dc31a1498953d81ab87b91f7ff85153` and evidence-wording follow-up
`f04ac32c907e705f981983ae273115fca7944fce` are published. Candidate CodeQL and
all four browser shards plus their aggregate passed. The full Twilight job,
including its packed-package suite, passed. Candidate CI `41660331719` completed
successfully at 16:34:15 UTC, including workspace and aggregate gate. The actual
complete backend suite passed 3905 cases, skipped three and failed zero; its
repaired delayed-integration case passed in 42309.96 ms. The original h4 queue expired with exit 75 before its payload
started; its supported finite 3600-second retry acquired the lock after 1906
seconds and printed the exact candidate SHA. The complete canonical h4 gate
exited 0: normal OpenSpec 323/323, frozen installation, format `--all`, both
uncached runtime batches, separate source lints and real-Docker solver smoke passed.

PR 839 merged normally at 20:08:38 UTC as
`91eac97bf739af228c38a6ca7633ea7c17821717`. All three reviewed blobs and the
actual merge patch match the gated candidate exactly. Actual parent
`415fd79026239a7641a15bd44188915121fed84b` includes two intervening main commits
changing only the separate SQLite race-worker test; that change was preserved
without overlap. The initial old-parent expectation failed and is retained in
`/tmp/runtime-dispatch-preparation-merge-receipt-20261103.json`. Candidate gate
success does not certify this later combined tree. Actual main CodeQL
`41709821884` completed successfully with all four analyses; this is a workflow
outcome, not a finding-free claim. Main CI `41709822821` completed successfully
at 21:39:47 UTC, including the workspace, Twilight/package, browser and aggregate
checks. The three conditional Tool Wiki steps were skipped; no Tool Wiki
certification is claimed. Full runtime counts and artifact hashes are recorded in
[the final source-validation receipt](../../openspec/changes/bound-registry-storage/verify.md#actual-merged-main-validation-complete--2026-11-03).
Registry activation remains unverified. The local complete ordinary
boot file passed 14 cases, with two observed negative controls; uncached backend
lint, forced typecheck/module check and build passed. Strict owning OpenSpec still
fails on the same thirteen baseline warnings; normal owning validation passes.
No registry task is closed and no product or monitoring service was deployed by
this integration. Local review/audit references:
`/tmp/registry-monitoring-integration-ci-review-20261103.md`,
`/tmp/registry-monitoring-integration-parent-ci-audit-20261103.json`, and the
`ci-codeql` receipts under `/tmp/registry-monitoring-source-integration-20261103/`.

## Conditional Slack incoming-webhook contract

Slack documents a JSON POST with text to a secret URL bound to an app/user/channel.
Payload channel overrides cannot establish a different destination. The webhook
response does not return a message timestamp; Slack describes other APIs for
retrieving it. Never retain the secret URL in evidence or errors.
[Incoming-webhook guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).

The official webhook guide checks **HTTP 200 and response body `ok`**. Unexpected
or empty bodies cannot establish that positive acknowledgement. The documented
contract does not establish that an ambiguous response means no message was posted.
[Official Python webhook guide](https://docs.slack.dev/tools/python-slack-sdk/webhook/).

JSON encoding and Slack text escaping are separate. Slack text has control syntax
for mentions and links; literal ampersands and angle brackets need escaping when
used as plain text. Its formatting guide supports disabling markdown processing.
[Formatting reference](https://docs.slack.dev/messaging/formatting-message-text/).

Slack's truncation policy includes incoming webhooks and allows truncation or
splitting above 40,000 text characters. That is not a documented total webhook-body
byte limit. A local bounded alert must preserve registry identity, capacity, remedy
and event identity without depending on truncation.
[Truncation policy](https://docs.slack.dev/changelog/2018-truncating-really-long-messages/).

Incoming webhooks have approximately one message per second posting capacity;
channel traffic shares limits and unpublished burst allowance is not dependable
storage. HTTP 429 carries Retry-After seconds. A bounded sender must preserve an
undelivered event when that delay exceeds its remaining attempt deadline.
[Rate limits](https://docs.slack.dev/apis/web-api/rate-limits/).
Malformed payload, prohibited action, missing/archived channel and server errors
have distinct documented responses; correcting configuration differs from retrying
an unchanged request.
[Webhook error contract](https://docs.slack.dev/changelog/2016-05-17-changes-to-errors-for-incoming-webhooks/).

## Ambiguity and evidence

No idempotency key, request deduplication guarantee or authoritative timeout
reconciliation was established in the reviewed webhook documentation. This is a
bounded evidence gap. A timeout after submission may lose only the acknowledgement;
retries may duplicate a post. Event identity can aid reconciliation without creating
provider deduplication. A local acknowledged-event record cannot remove the
send/acknowledgement crash window.
[Incoming-webhook guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/),
[official retry guidance](https://docs.slack.dev/tools/python-slack-sdk/webhook/#retryhandler).

Refusing redirects would be an explicit local boundary, not a Slack requirement:
the reviewed contract does not require replaying a secret-bearing request to a new
target. The actual destination, endpoint scope, retry/ambiguity policy and installed
credential binding must be established before using this protocol.

A real provider acknowledgement, an independently observed channel receipt and a
human read are different evidence. Local HTTP tests establish sender protocol
behavior only. Activation still needs nonsecret receipts matching unique required
warning, cutoff, failed-cleanup, backup-failure and missing-report events in the
actual destination. No such delivery was exercised by this research.

## Independent missing-check path

The accepted [monitoring design](../../openspec/changes/bound-registry-storage/design.md)
requires an independent observer to deliver an alert after five minutes without
pressure reports. Killing the source reporter and observing delivery tests that
failure path. Repeated cached success cannot reset measurement age. Local process
separation does not establish host independence.

The reviewed design does not impose recursive watchdogs watching one another.
Observer failure visibility remains an operational concern to resolve concretely;
this research adds no unrequested infinite monitoring requirement. Held platform
stages remain held. No account/API call, secret access, remote/root operation,
runtime test, activation or product change was performed.
