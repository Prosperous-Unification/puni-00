# Registry monitoring — staged source pipeline

Task 5.1 of [bound-registry-storage](../../../openspec/changes/bound-registry-storage/tasks.md)
remains open. Local pressure/status reporting now feeds durable alert capture and
a separately staged sender. The installed destination, independent monitoring
path and activation still require evidence.
The local source prerequisite passed scoped review and ordinary verification.
See the [verification record](../../../openspec/changes/bound-registry-storage/verify.md#source-alert-prerequisite-accepted-locally) for its exact snapshot and remaining installed/live obligations.

The existing pressure service remains in the
[registry storage role](../../ansible/roles/registry_storage/templates/puni-registry-pressure.service.j2).
It renews write permission every ten seconds. Each successful check supplies its
actual measurement to a bounded local report; healthy reporting does not rewrite
canonical history. Existing thirty-second permission expiry remains independent
of notification delivery.

The report cache is `/run/puni-registry-pressure/report.json`. The existing service
owns the owner-only runtime directory. One current file and one pending replacement
have a 16 KiB serialized limit each. The cache is volatile and outside both captured
backup roots; it is neither a delivery outbox nor a notification success receipt.
An empty validated directory is explicitly never-reported. Missing or unreadable
installed directories, malformed reports and unresolved replacements are errors.

The existing status entrypoint reads a fully validated atomic canonical snapshot
without acquiring command authority. Pressure is fresh only when its identity,
boot, revision, semantic snapshot hash and observation age bind that snapshot.
Changing file modification time or rereading success never refreshes observation
age. Status exposes unavailable physical content/accounting dimensions explicitly;
prior backup verification retains its original timestamp and lineage.

The reservation projection is `{count, bytes, inodes, entries}` from the validated
canonical reservations; these amounts do not stand for measured content usage.
Verified backup output retains its original `registryId`, `storageId`, `registryPath`
and verification time alongside its current/historical lineage classification.

The [nightly retirement units](../registry-backup/) retain their existing location.
This prerequisite does not enable or start a unit. Existing suspended platform
alert stages remain suspended.

The source pipeline captures required incidents before replacing the volatile
report or clearing a durable maintenance failure for retry. Normal observations
and producer restarts preserve undelivered incidents. An acknowledged warning
rearms only after an actual normal, unfenced observation; changing pressure levels
does not start another episode.

The sender requires explicit pre-enrollment at
`/etc/puni/registry-monitoring-source.json`. Enrollment binds the selected store,
registry, permanent locks, destination and credential identity. Runtime refuses
missing established state and an unproven storage profile. It does not create the
store. The staged sender service permits writes only beneath
`/var/lib/puni-registry-monitoring/source` and receives its webhook through systemd
`LoadCredential`; the producer never reads that secret. Dedicated storage and
trusted enrollment must be established and independently verified before enabling
either side. The [source design](../../../openspec/changes/bound-registry-storage/design.md#source-alert-capture-and-delivery-prerequisite)
records the exact limits and remaining physical proof requirements.

One explicitly selected conditional Slack incoming-webhook adapter requires exact
HTTP 200/body `ok` acknowledgement. Attempts and their finite allowance are durable
before requests. A stopped sender or uncertain response retains uncertainty;
possible duplicate delivery is explicit. Separate sender and state locks keep
network requests outside authority renewal. The new sender service and timer are
staged files, with no installation or enablement performed here.

Completion still requires reuse of the actual configured external destination,
an independently hosted five-minute missed-check path, complete protected-owner
evidence and actual delivery receipts for warnings, cutoff, cleanup and backup
failures. Separate local processes and an owned loopback HTTP receiver establish
local behavior only. They cannot substitute for destination or independent-host
evidence.
Installed runtime access, storage/privilege boundaries and the exact-revision host
gate must be verified before activation; see the change's
[verification record](../../../openspec/changes/bound-registry-storage/verify.md).

Conditional destination acknowledgement, retry ambiguity and delivery-evidence
research lives in [monitoring delivery research](../../../docs/findings/registry-monitoring-delivery.md).
It does not identify or select the installed destination protocol.
