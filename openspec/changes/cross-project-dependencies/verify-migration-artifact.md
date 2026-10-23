# Bounded P2b-1 migration artifact

Source base: `05e6dc1df1760c593703f2005d5abe5f60a615c9`. This packet implements
only the independently pinned migration-artifact constructor and fresh read-only
observer from the accepted P2b design. Parent P2b, O4, S4 and task 10.2 remain open.

The constructor accepts a separately prepared candidate directory and independent
source/image attribution. It rejects installed shared-edge artifacts and aliases,
produces closed canonical manifest bytes, and grants no historical build
provenance. Expected preparation must come from the reviewed candidate build;
hashing an installation does not approve that installation.

The observer derives the installed path from canonical shared-edge state and the
supplied manifest hash. It requires the live joint owner and source SHA, retains
ordinary ancestor descriptors and every original tree file/directory descriptor
across image work, compares complete membership and exact streamed byte hashes,
resolves the immutable image before/after the actual scanner, and verifies the
original retained tree plus a fresh complete scan before returning
`activation: 'blocked'`. Snapshot JSON contributes only artifact identity.
Existing applied-migration capture APIs are unchanged; no capture or database
connection is created by this module.

The private mode boundary is the prepared artifact root and descendants, or the
fixed installed state/artifact subtree. Preceding OS ancestors must be canonical
ordinary directories with retained descriptors and no symlink components. A
standard root-owned sticky `/tmp` may contain a separately prepared private root;
this packet never changes OS ancestor permissions.

## Scanner startup and resource limits

The fixed image helper uses the full immutable image ID, network none, read-only
root, no mounts, `/` working directory, `/usr/bin/env -i`, fixed PATH and disabled
Bun transpiler cache. Native BusyBox resolves the unique effective UID passwd
home, checks traversable ordinary ancestors and absence of home/root Bun configs
including dangling entries, and refuses setuid/setgid Bun executables before
Bun startup. It re-scrubs the environment at the final exec. The shared scanner
imports only filesystem, path and crypto modules; it imports no app/store code.

Manifest and response limits are 4MiB, SQL 8MiB, snapshot 16MiB, total artifact
256MiB, migration count 1..4096, name 160 bytes and read chunks 64KiB. Entry
budgets must be finite and at most 120 seconds. Docker abort is followed by
awaited transport/owner settlement, rather than detached timeout rejection.
The RunDocker adapter must honor abort and settle its killed CLI child.

A successful result establishes scanner completion and artifact equality. It
**does not establish Docker daemon container absence**. The frozen anonymous
`docker run --rm` invocation is unchanged. A failed/aborted probe returns no
observation; its CLI/owner boundary settles first, owner and operation intent
remain retained, and the safe diagnostic gives purpose, immutable image ID and
SHA256 of the exact arguments for locating the private intent. It explicitly
reports container cleanup unverified. No automatic stop/rm extension is included.

## Local verification

All commands use pinned Bun 1.4.2 at
`/tmp/puni-pr630-bun142-al30yoqo/bun`, with that directory prepended to PATH.
Nx uses `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Existing dependencies were
reused only after exact `package.json` and `bun.lock` equality against the shared
installation; no fresh installation is claimed.

Completed local commands (all exit 0):

- Focused `bun test` artifact and subprocess suites: 61 passed, 0 failed, 216 assertions after the final restored-source mutation packet.
- Configured `tool-remote-scripts:lint`: passed with actual target output.
- Configured `tool-remote-scripts:typecheck`: passed with actual target output.
- Configured `tool-remote-scripts:build`: passed; all five entrypoints bundled and the configured dependencies completed.
- OpenSpec `validate --all --json`: 277 passed, 0 failed (259 changes and 18 specs).
- Scoped Prettier and `git diff --check`: passed.

The initial constructor stub failed the positive manifest assertions before
implementation. Actual native subprocess tests run in disposable bwrap namespaces
with approved execution. They compare complete independently expected SQL/snapshot
identities; malformed UTF-8 and extra members fail inside the actual scanner.
Both source and bundled scanner programs run against app fixtures whose import
would create SQLite state and throw; the writable fixture scratch remains empty.
Poisoned HOME/XDG/Bun/Node/DB environment does not reach Bun. Native config poison,
dangling entries, unreadable home, missing native executable, duplicate UID,
wrong cwd and setuid runtime fixtures refuse before scanner output.

Fresh pinned Bun observation at `/` with HOME absent: `/bunfig.toml` is loaded;
passwd-home `.bunfig.toml` and `/.bunfig.toml` are ignored. The native contract
conservatively proves all three absent regardless of that observed lookup.

## Watched R5 negatives

Fifty-one independent production omission variants each failed an intended assertion
with exit 1, then source was restored. Logs and the complete mutation driver are
retained locally at `/tmp/puni-migration-artifact-proofs/` and
`/tmp/puni-migration-artifact-mutants.py`; `summary.json` reports 51 variants,
zero unproven. Adjacent production `Proof:` comments identify the affected tests.

| Guard family                                                      | Observed failure under omission                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closed pins/schema/canonical manifest/digest/required migration   | Malformed attribution, duplicate/unknown keys, noncanonical bytes, wrong digest or missing activation migration admitted; refusal assertion failed.                                                                                                            |
| Joint owner/source/layout/private parent                          | Coherent foreign source SHA, foreign dev layout or unsafe envelope admitted; corresponding observer negative failed.                                                                                                                                           |
| Independent installed/image comparison and second resolution      | Initial SQL mismatch, changed image hashes or changed second image identity admitted; corresponding observer negative failed.                                                                                                                                  |
| Retained file/root identities, final enumeration and fresh reread | Same-byte root/manifest replacement, late file or changed streamed SQL admitted; corresponding real filesystem negative failed. Redundant final metadata/listing checks were omitted together where documented in adjacent comments.                           |
| Hardlink/modes/UTF-8/down/snapshot/membership                     | Invalid real files or ignored extra file admitted; malformed-complete-artifact assertions failed.                                                                                                                                                              |
| Byte/count/deadline/name/order/stamp limits                       | Invalid rows admitted or oversized input reached parser/member-read dispatch; boundary assertions failed.                                                                                                                                                      |
| Native config/UID/cwd/runtime/environment                         | Poisoned or inaccessible startup inputs reached Bun, or shell-added environment survived; native subprocess assertions failed.                                                                                                                                 |
| Docker network/read-only/cwd/immutable image                      | Exact production argv assertion failed independently for each omitted boundary.                                                                                                                                                                                |
| Private Docker/parser errors                                      | Secret fixture sentinel reached public diagnostic; secrecy assertion failed.                                                                                                                                                                                   |
| Aborted transport settlement                                      | Replacing the local joined transport with `runDockerBefore` returned while gated cleanup was pending; the return-state assertion failed.                                                                                                                       |
| Live scan/manifest descriptor retention                           | Disabling retained scan descriptors left fewer than seven real original-tree FDs, or disabling the retained manifest left its original FD absent during the gated probe; the FD assertion failed. All original-tree descriptors close before completed return. |

## Unverified and excluded

No actual Docker image/daemon or host acceptance was exercised. No independently
reviewed candidate build/manifest was delivered or installed by this local packet;
its historical provenance and real installation remain separate prerequisites.
No container-absence receipt is claimed. Full Nx test/Caddy targets and h2/h4
exact-SHA host gates were intentionally not run here; root coordinates those
separately. No image pull/build, artifact install, store open, backup, migration,
activation, restart, ingress or host operation occurred.
