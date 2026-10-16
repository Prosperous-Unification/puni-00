## Context

Baseline: release candidate `0aab48a2415d51e461abaf987c95ef576a194736` (#546), pending merge. Read the existing [typed evidence contract](../f9-source-memory-evidence/specs/forge-source-memory-evidence/spec.md), [local observer design](../f9-local-source-memory-observation/design.md), and [runbook](../../../docs/infra/local.md#local-runtime-source-memory-observation). `validateSourceMemory` checks consistency against a supplied binding. `observeSourceMemory` resolves crictl and inspects a selected Unix endpoint, takes a path-based sample, then reinspects. Neither authenticates the operator's runtime/namespace selection. `runRecoveryLab` always refuses before lifecycle mutation.

The separate bounded feasibility worker reported Bun 1.4.2, Linux 7.0.11 x86_64 and a libc helper compiled with strict warnings. Its inherited socket readSync control returned actual bytes, but Bun `net.Socket({fd:3})` timed out. A tiny native relay using SO_PEERCRED/SO_PEERPIDFD preserved connection A after pathname replacement, rejected new foreign B before bytes, and rejected a same-UID foreign downstream connector before upstream bytes. This is reported probe evidence, not a production transport choice. It had no crictl/containerd, full duplex CRI, reconnect, installed package, protected authority, complete descriptor cleanup or peer-liveness acceptance. The peer pidfd was held until completion but never polled or revalidated for liveness; the successful readSync control used an actual AF_UNIX socketpair, not a regular file. The temporary source is not copied into production.

## Goals / Non-Goals

**Goals:** one separately authenticated acquisition path, complete identity continuity through transport and sampling, bounded private evidence, and installed consuming acceptance with watched safety faults.

**Non-goals:** altering the existing diagnostic APIs or exact 2Gi requirement, automatic lab lifecycle, cluster mutation, retrospective first-attempt reconstruction, OOM diagnosis, readiness verdicts or complete F9 acceptance.

## Decisions

### Delivery order and ownership gate

One change has three dependent milestones: (1) capability feasibility and native ownership, (2) complete authenticated transport plus retained-reference sampler, (3) installed acceptance. Milestones are not separate partial authenticity claims. Keep every task unchecked until its observed proof exists. Before implementation selects native code, record its owning Nx project, maintainers/installation owner, supported Linux/Bun/cri-tools/containerd versions, build provenance and protected install/configuration location. Bun/Nx invoke the native toolchain in the owning build environment; no second task runner or candidate-built helper is trusted by proximity. A PM-reported read-only h2puni probe found Linux 7.0.0-30-generic and a containerd socket, but no cc or crictl on PATH. Target-node tools can differ, and the protected package can supply reviewed binaries; do not require host compilation, assume PATH tooling, or treat the socket as authenticated authority.

The native one-shot relay is preferred only if milestone 1 proves its ownership and required kernel/CRI contracts. One-shot means one bounded observation invocation, not one read/write or one assumed CRI connection. A missing capability blocks that path. Changing transport requires an explicit design amendment and equivalent adversarial acceptance, rather than silently falling back to path checks or numeric PIDs. No ADR is selected while this choice remains conditional.

### Authority boundary

Source observation authority is provisioned by a separately trusted installation owner, outside the candidate and caller's writable tree and account authority. It supplies an invocation-bound runtime/node identity, trusted executable/configuration closure and expected source selection. Caller Pod/container values are requests to match against this source, never authority. A caller-provided digest, socket pathname, UID, executable name, PID, namespace FD or matching JSON cannot bootstrap trust.

Milestone 1 must specify the protected authority reader and how it authenticates the runtime service and node/process/mount relationship in the supported deployment, including nested node containers. A config file that merely repeats caller assertions does not qualify. The trusted acquisition process itself must execute beyond candidate/caller control: protection covers ptrace/process-memory mutation, proc descriptor access, preloads and inherited descriptors, not just file modes. A caller able to mutate the authority process or its dependencies defeats this boundary; such a deployment cannot activate authenticated acquisition. Same-UID listener refusal alone does not prove this execution isolation. Absence or unverifiable ownership is a refusal. A first-source label additionally requires independently captured first-source lineage; the current observation cannot recreate missed history.

### Conditional native relay

The proposed helper owns the upstream socket and authenticates its actual connected peer against authority, retaining the peer's stable kernel reference and checking liveness across the invocation. No later crictl connection to the original pathname can bypass it. The helper starts only a protected, pinned standalone crictl executable with fixed inspect arguments and a scrubbed environment, using a private invocation-owned listener. The downstream socket must belong to the exact direct child whose identity is retained until reaping. A reusable PID, matching UID or arbitrary descendant is insufficient. Protect the executable and its execution dependencies through launch; path resolution plus a pre-launch hash is insufficient.

Implement nonblocking bounded duplex with partial-read/write handling, backpressure, EOF/half-close, errors and complete CRI framing. Define finite byte/connection budgets before execution and authenticate every additional connection/reconnect to the same authority. The pinned supported crictl behavior determines the required connection pattern; neither a one-message echo nor an assumed single HTTP/2 session is evidence. Unexpected reconnect or exhausted budget refuses. The helper owns descriptors, private directory/listener, child lifetime and cleanup; client/library cancellation must not orphan it.

### Retained-reference sampler

The authenticated boundary acquires and retains the selected init process, namespace, procfs and exact cgroup-v2 directory references. Verify the filesystem/mount identity and relationship to the authenticated node/runtime before using them. Resolve bounded relative reads from retained directory references with containment, no symlink/magic-link traversal and required-file validation. Carry those same references through the process snapshot, cgroup metrics and final source reinspection. Never turn authenticated identities back into caller-selected roots or re-resolve public paths for individual reads.

The sampler must distinguish a live captured process from numeric PID reuse and refuse on init exit or an observed starttime/namespace/membership change, directory identity replacement or runtime/source replacement. Retained-reference reads resist pathname swaps, including changes restored before final checks. They do not make sequential process/metric observations atomic or prove all possible transient kernel-state changes absent. State the exact continuity coverage in evidence and documentation.

### Evidence and consumption

Use a separate authenticated result type with only protected provenance, invocation identity, declared source binding and sanitized complete samples. Do not brand, cast, spread or deserialize an ordinary SourceMemoryEvidence value into it. The verifier checks authenticity at the acquisition boundary, then reuses `validateSourceMemory` for exact identity, init presence, complete counters and 2Gi consistency. The existing validator's scope does not change. Any persisted transport must separately define strict decoding, stable byte/invocation binding and external authentication before consumption; a self-issued hash is insufficient.

One monotonic budget covers local runtime IO, connection attempts, sampling and cleanup; per-file/output/member/connection bounds are fixed before execution. The installed wrapper adds a watchdog and owns termination/reaping. Keep the existing 64KiB required-file/runtime-output and 256 exact-member ceilings or justify stricter limits; CRI relay framing has a separately reviewed finite aggregate budget. Sanitized errors do not include raw runtime output, argv, environment, credentials or trusted paths. Scheduler delay and uninterruptible IO remain explicit limits.

## Risks / Trade-offs

Privileged/protected installation is required if the threat model includes the caller's account; same-user hashes cannot supply that authority. Kernel peer-reference and mount-resolution capabilities vary by deployment. Native build ownership and installed binary/configuration closure add ongoing work. Complete CRI multiplexing and reconnect behavior are unproven. Runtime source identity and mount provenance must be established within the actual node namespaces, not guessed from host paths. These are gate conditions, not reasons to relax authentication.

## Migration Plan

Add the capability alongside existing diagnostics. Keep recovery provisioning disabled. Ship no authenticity label until transport and sampler meet the complete contract. Exercise one fresh installed consumer against the supported real runtime in an attended/disposable environment with its own authority. Update symbol JSDoc and `docs/infra/local.md` only with observed scope and limits. A failure retains diagnostic evidence as diagnostic and leaves authenticated acceptance open; no production rollout or lab lifecycle is authorized by this draft.

## Open Questions

Milestone 1 has explicit decision outputs rather than implicit implementation freedom: native project/installation owner and supported deployment matrix; protected runtime/node/first-source authority provenance; live peer-reference and namespace/mount acquisition primitives; exact CRI duplex/reconnect limits and cleanup/watchdog contract. Resolve these with recorded tests and amend this design before milestone 2. If they cannot be satisfied, keep the capability unavailable and return for design review. No fallback mechanism or authenticity claim is approved by this draft.
