# Planning verification

This is a design-only draft. No runtime implementation, installed authority, authentic source-memory observation or F9 acceptance has been delivered. Every tasks.md checkbox remains open. This file is included during planning at the PM's explicit request under AGENTS R4; it is not an implementation completion record.

## Baseline and inspection

The isolated `/tmp/wbs07014-runtime-binding-spec-sol` clone follows release candidate `0aab48a2415d51e461abaf987c95ef576a194736` (#546), pending merge. `LLM_README.md`, AGENTS.md, the root Forge glossary, existing typed evidence/local observer specs and implementation, consuming tests and `docs/infra/local.md` were read. Existing diagnostics explicitly lack runtime authority and retain sequential path-based limits. `runRecoveryLab` remains disabled.

The available cached OpenSpec 1.12.0 CLI was invoked through Bun at `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`; `--version` printed `1.12.0`. Direct invocation from the global package cache failed because its missing dependency installation attempted a read-only temporary/cache location. No repository dependency install or implementation test was run to work around that failure.

## Preliminary feasibility evidence

A separate worker reported `/tmp/f9-binding-feasibility-20261016/probe.log`, inspected during drafting: actual inherited AF_UNIX socket readSync control exited 0; Bun net.Socket inherited-FD wrapper timed out with exit 23; captured endpoint A survived pathname replacement; fresh B expecting A refused 41 with zero B request bytes; foreign same-UID downstream connector refused 43 with zero upstream bytes. These are tiny-message fixture mechanisms only. The peer pidfd was held, not liveness-polled. Strict native compilation was reported by that worker; it was not rerun in this draft clone. The temporary probe sources and logs are not committed or relied on as durable production acceptance receipts.

The PM separately reported h2puni Linux 7.0.0-30-generic and a containerd socket, with no cc or crictl on PATH. This was not rerun here and does not prove target-node capability or a blocker; protected artifact packaging can supply trusted binaries.

No crictl/containerd, complete duplex/reconnect CRI, protected installed authority/execution, native package/install closure, namespace/mount continuity, retained-reference sampler, production guard removal, child/descriptor cleanup or installed consumer acceptance was verified. These absences block authenticity activation and remain explicit tasks.

## Failure-proof table

| Proposed check                                       | Required fault and consuming proof                                                                                       | Observed implementation outcome                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Protected authority and executable/execution closure | Caller-issued authority, replacement/writable code/config, preload or process mutation; slices 1.1 and 3.1               | Unverified; no implementation                                    |
| Actual connected runtime and child identity          | Foreign endpoint/reconnect, peer death, same-UID connector and PID reuse; slices 1.2 and 2.2                             | Unverified in production; tiny fixture probe is preliminary only |
| Retained process/mount/directory binding             | Path swap-and-restore, foreign mount, symlink traversal, init exit/reuse and observed identity change; slice 2.3         | Unverified; no retained-reference sampler                        |
| Bounds, privacy and cleanup                          | Missing/unreadable/malformed state, stalls, overflow, secret output, leaked descriptors and unreaped children; slice 2.4 | Unverified; no production negatives                              |
| Installed consumer and scope                         | Missing/changed package, forged ordinary evidence, source fallback and verdict promotion; slices 3.1–3.3                 | Unverified; no installed acceptance                              |

## Draft checks

Observed draft commands:

- Cached OpenSpec 1.12.0 via Bun: `validate f9-runtime-source-memory-binding --strict --json` exited 0; one passed, zero failed, no issues.
- Same CLI: `validate --all --json` exited 0; 238 passed (220 changes, 18 specs), zero failed. Raw outputs are in `/tmp/wbs07014-validation.json` and `/tmp/wbs07014-all-validation.json` during this drafting session.
- `bun /tmp/wbs07014-format.mjs check` exited 0: Prettier 3.9.6 checked all six explicit Markdown files using this clone's `.prettierrc.json` settings and the existing installed Tailwind plugin. An initial clone-local CLI call failed plugin resolution; an absolute-path CLI call from another checkout did not enumerate files and was not treated as proof. The explicit API inventory avoids that vacuous check. An initial formatter helper typo named `.prettierrc` rather than `.prettierrc.json`; the corrected helper passed.
- `git diff --check` exited 0. Intent was 318 words before formatting, within the 400-word cap. Final word count and validation are rechecked before commit.

No full Nx test/lint/typecheck/build, browser, native build, Docker/k3d, live cluster, deployment or h2puni gate is claimed for this planning change.
