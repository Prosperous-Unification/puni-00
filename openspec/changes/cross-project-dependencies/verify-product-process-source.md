# Product process observer source proof closure

This is bounded source/model evidence for the existing observer contract. Whole-observer
source review and full frozen composition replay have completed; actual pinned-image StageB acceptance,
collector/HTTP/coordinator composition and complete P2b/P3 remain open. The two untracked
native rehearsal drafts are excluded and unrun.

The runtime change mechanically extracts decoding, joins and token hashing from
`dependency-product-process.ts` into internal `dependency-product-validation.ts`.
Host proc reads retain their original sequential brackets and bounds. Genuine owner,
record and deadline admission, actual metadata/exec IO, initial private binding,
terminal state, audit, cleanup, returned clones and freezing remain in the observer.
`observeSelectedProductRole(context, role)` remains the sole observation API. The
extracted functions return parsed evidence, never a readiness grant.

## Bounded matrix

`dependency-product-validation.test.ts` exercises the exact production functions directly
in an independent Bun test process, without importing the mock-bearing model:

| Boundary       | Positive and refusal evidence                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host status    | Ordinary two-level mapping; wrong depth/root/Tgid, missing/duplicate fields, malformed/truncated/out-of-range UID tuples                                                                                              |
| Host identity  | Identity user/group maps, full cgroup format, changed start at each readback, changed UID/NSpid/Tgid and cgroup readback                                                                                              |
| Host roster    | Correct root mapping and parent membership; duplicate host/inner PIDs, wrong PID1 and escaped parent                                                                                                                  |
| Inner receipt  | Complete two-pass proc shapes; omitted/extra/duplicate/unmapped process, start/UID/cgroup join mismatch, pid/net/mnt mismatch, missing/oversized/malformed proc/argv/executable fields                                |
| Launch         | Supported init/application and init/wrapper/direct application; unsupported helper/wrapper, init argv, executable and cwd                                                                                             |
| Listener       | IPv4/IPv6 concrete and wildcard positives; absent FD, init/wrapper owner, duplicate/shared FD ownership, foreign/competing same-port listener, wrong port, shared cross-family inode and multiple same-family sockets |
| Address        | Concrete nonlocal address, missing local family for either wildcard family, alias/scoped/mapped/noncanonical forms                                                                                                    |
| Receipt digest | Independent NUL-framed hash of all emitted tokens; changed accepted executable metadata with identical session/frame count changes the digest                                                                         |
| Raw reader     | Actual positive read; ENOENT absence, EISDIR unreadability, byte cap and malformed UTF-8 are distinct refusals                                                                                                        |

Retained executable/argv/cwd binding and full metadata admission continue to use their
existing checks. Exact delegated tests are `participant <backend|gateway>
<missing-label|wrong-label|wrong-image-id|working-directory|entrypoint|shadow-mount>
refuses before ingress or irreversible activation`, the positive `product image
provenance and exact existing launch contracts accept actual positive fixture
observations` in `dependency-participant-readiness.test.ts`, and the exact/stable
identity cases in `dependency-participant-transition.test.ts`. These delegated tests
were read, not all replayed here; their implementations were not changed. The genuine
raw model additionally changes actual container `Path` and proves refusal before exec.

The existing expensive child retains all 16 case identities. Its success case adds a
restored pre-exec UID-map fault, altered raw metadata refusal, and independent comparison
of actual emitted receipt tokens against the owner-audited response hash. Its init-owned
listener failure additionally proves that the later gateway call dispatches no metadata
or exec. Its private-stderr case now runs the production byte transport against an owned
local CLI: actual bytes carry modeled proc frames, actual ACK precedes private stderr
and truncated EOF, and the exact local child is absent at refusal. Local return-time child/token settlement is captured inside the raw seam and asserted outside observer error sanitization. Its cleanup-failure
case independently proves ACK then truncated EOF without stderr, with the specific
`exec receipt is incomplete` outcome. Neither case has a successful failed-session
readback or a later dispatch. No context is reset after terminal failure.

The local CLI is supplied in the isolated child's startup environment. Before transport,
the fixture requires exact `Bun.which('docker')`, device/inode, owning UID, mode, regular
file, realpath and fixed content. No fixture fallback to installed Docker is permitted.
Separate cheap child tests cover missing/resolved/replaced/changed/nonprivate/symlink
mappings. The ordinary model parent retains real-reader sentinels, exact 16-name summary,
1440-second child and 1500-second outer budgets; cheap nonzero, signal and output-cap
negatives join their actual owned child. Per-case 300-second and product deadlines,
concurrency and retry policy are unchanged.

## Watched omissions and checks

Private raw logs use `/tmp/puni-product-proof-*.log`; manifests are
`omissions.json`, `reader-omissions.json`, `harness-omissions.json`,
`wiring-omissions.json` and `eof.json` under that same prefix. The corresponding private
watch scripts retain exact substitutions and restore source in `finally`.

- 35 isolated validator omission families caught host status/maps/readbacks, roster
  identity/parents, inner start/effective UID/tuple/root UID/cgroup/namespaces/status,
  executable metadata, application executable/cwd/init argv/wrapper, listener
  inode/owner/family/local address and receipt-content substitution.
- Two additional reader/stat omissions caught wrong-PID stat acceptance and removed
  raw byte bound. Five cheap harness omissions caught fake-CLI resolution/content/inode,
  nonzero exit acceptance and output-bound removal.
- Four genuine call-site substitutions caught omitted host-map admission, profile call
  replaced with unvalidated projections, omitted incremental hash call and omitted
  terminal guard following actual local transport failure.
- Removing the actual shared transport framing guard caused the cleanup EOF test to
  fail: its observed transport failure changed from `exec receipt is incomplete` to null.
  The shared transport was restored exactly; it has no committed delta.

The initial import-first RED is `fast-red.log`. Corrected frozen fast checks:

| Command                                                                            | Observed evidence                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun test tools/tool-remote-scripts/src/lib/dependency-product-validation.test.ts` | 75 pass, 0 fail, 95 Bun assertions; `fast-freeze.log`                                             |
| Focused ordinary harness, fake-CLI, real supervisor and byte-transport tests       | 19 pass, 0 fail, 53 assertions; `fast-io-freeze.log`                                              |
| Genuine success and listener wiring extensions                                     | Both passed in `wiring-green.log`; that run's initial transport attempt failed and is retained    |
| Corrected genuine private-stderr transport                                         | 1 pass, 139 assertions, 55.27s; `transport-green2.log`                                            |
| Captured local settlement outside observer sanitization                            | Both actual transport cases passed, 280 assertions, 88.16s; `transport-settlement-freeze.log`     |
| Deterministic genuine cleanup EOF                                                  | 1 pass, 138 assertions, 43.69s; `eof-green.log`; its framing omission failed in `eof-omitted.log` |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:<lint    | typecheck                                                                                         | build> --skip-nx-cache` | All targets passed; `lint-freeze.log`, `types-freeze.log`, `build-freeze.log` |

The first frozen combined collection at production source `b8e7b967d67b465cca2eefc483b59a6be6a82948`
failed preparation: 95 pass, 2 fail, 152 assertions, 13.71s in `final-parent.log`.
The launch added `umask 077` to privatize its log. A private diagnostic capture pinned
`solver-host.ts`'s exact installed-tuple mode refusal; no observer check was reached.
The actual mapped scratch files had correct hashes but Bun/bundle mode0700 instead of
0755 and unit0600 instead of0644. Direct fixture controls at077 and inherited0002
confirmed rejection versus exact755/755/600/644 acceptance in `umask-control.json`.
The unchanged genuine actual-reader case then passed at normal0002: 1/0, 135 assertions,
85.88s in `post-freeze-preparation.log`. Diagnostic-only core instrumentation was restored
exactly; no production or fixture mode requirement was relaxed.

The model parent now prints its bounded joined child transcript before classification;
the first failed parent's child transcript had been discarded before its fixed error.
Its exact failing child identities cannot be reconstructed from that lost buffer.
A complete replay remains pending. It must inherit the original umask, with only the
log precreated/chmod0600. Exact source SHA, complete case names and final output will
be retained in the private closure report; no complete-run pass is claimed here.

Initial sandbox genuine preparation failed before observer entry; local fixture reruns
used the previously authorized unprivileged execution allowance. An initial Nx command
printed socket-denial fallback and exited 0 without running its target; it is excluded
from passing evidence. All reported Nx checks explicitly disabled daemon/plugin isolation
and printed target execution and success.

A transport fixture diagnostic mistakenly reached the installed Docker CLI because Bun
used startup PATH despite an in-process PATH change. The actual invalid `-- nonce
<scratch receipt>` invocation printed `unknown command: docker nonce`; no daemon effect
is established by that output. That fixture approach was removed. No successful Docker,
SSH, sudo, unshare, CI dispatch, native-image/scanner or production action was performed.
The previous privileged-probe rejection remains binding. No full host gate, full Nx test
with Caddy/native prerequisites or native acceptance is claimed. The unprivileged real
supervisor positive remains a minimal DONE scanner payload, not OBSERVER_PROGRAM.

## Root-owned frozen composition completion

Independent Astra source review approved exact `7289166b473014d2cba8377aa685aeb174fb2c3c`
conditional on its complete frozen composition. The root-owned replay exited 0:
97 outer tests / 292 assertions in 994.18s, including the real reader and
watchdog/error-contract cases; its isolated child completed all 16 ordered model
cases / 2,103 assertions without failure, signal, expiry, skips or todos.
All frozen source and dependency hashes remained unchanged. The
[completion receipt](evidence/product-source-integration-728.json) retains exact
case identities, hashes and terminal status. This satisfies the source-review
condition; actual native image/kernel and complete coordinator acceptance remain open.

The earlier worker-owned session became unavailable in both agent contexts;
no final summary, exit or signal could be recovered and an independent process
scan found no remaining owned process. Its completion remains unverified; no
cause is asserted. That partial log and the earlier diagnosed umask refusal are
retained. The successful replay used inherited umask 0002 and a separately
precreated 0600 log, with an explicit root-owned terminal record.

Fresh combined-foundation checks before committing this integration passed:
88 validator/byte-transport/producer/exec tests with 131 assertions in 745ms;
seven genuine-context/real-reader/cheap harness tests with 152 assertions in
58.02s. The full nested model was excluded from this second focused check
because its exact frozen-source replay is recorded above. Configured uncached
`tool-remote-scripts:typecheck` and `tool-remote-scripts:lint` both executed
successfully with daemon/plugin isolation disabled, in 18.3s. These checks do
not claim a full workspace or canonical host gate.
