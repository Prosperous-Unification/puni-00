## Scope and identity

Authorized throwaway protocol feasibility only. Base: `233759a12` in the isolated
`/tmp/f9-cri-transport-sol` clone. Source SHA256 identities and tool versions are
in [environment.json](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/environment.json).
The reviewed diff retains only the single-connection explicit crictl mode.
The abandoned paired candidate remains outside the repository as a hashed scratch
patch. The syscall trace observes that candidate's unchanged single-pair forwarding
path; it provides no validation of the removed paired loop.

## Observations

| Command / review                                                                                                     | Exit / finding                                                                                                          | Evidence                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Original explicit CRI consuming test                                                                                 | 1: Python-only argv sends crictl `-I`; expected real runtime response absent                                            | initial-red.log.json                |
| `CRI_PROBE_CRICTL=/tmp/f9-cri-bin/crictl bun test ./tools/tool-devsync/feasibility/source-memory-relay/cri.probe.ts` | 0: 2 cases, 5 assertions, 494ms; direct baselines, Version response, additional-connection refusal and cleanup observed | focused.log.json                    |
| `bun test ./tools/tool-devsync/feasibility/source-memory-relay/relay.probe.ts`                                       | 0: 26 cases, 117 assertions, 27.44s                                                                                     | generic-regression.log.json         |
| `strace -ff -e trace=read,write,poll,shutdown,connect,accept4` on explicit fixture                                   | CRI client exits 0; strict relay fails writing late 17-byte HTTP/2 PING ACK with EPIPE                                  | shutdown.strace.json                |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                             | 0: 238/238 valid, no failures                                                                                           | environment.json validation summary |
| Cached Prettier 3.9.6, portable repository config, changed Markdown/TS/JSON/YAML only                                | 0, all files formatted                                                                                                  | scoped local output                 |

Evidence filenames above resolve under
[the CRI receipt directory](../../../tools/tool-devsync/feasibility/source-memory-relay/evidence/cri/).
GNU time reported CRI maximum RSS **55,760 KiB**, 0.49s, zero swaps;
generic regression **34,188 KiB**, 27.44s, zero swaps. These are process/children
maximum RSS readings, not simultaneous process-tree memory sums.

## Failure proofs

| Check                                    | Injected fault                                                     | Test observing failure                                           | Actual output                                                                                 | Restored outcome                              |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fixed read-only native command selection | Remove selection guard from compiled temporary C source            | records real CRI single-connection behavior and refusal cleanup  | forbidden reaches BOUND and exits 1/release instead of 64; consuming assertion fails          | explicit CRI control passes                   |
| Pinned crictl executable                 | Replace executable with /usr/bin/true, then omit digest comparison | rejects a different crictl executable before starting the daemon | stdout includes direct Version/daemonReaped instead of being empty; consuming assertion fails | digest mismatch refuses before daemon startup |
| Existing native guards                   | Existing nine source faults and cleanup-clock regressions          | 26-case generic regression                                       | 26 passed / 117 assertions on restored source                                                 | inherited guards preserved                    |

Adjacent Proof comments name the two new watched guard omissions. Runtime refusal
after valid Version output is recorded, never promoted to clean transport success.
The syscall trace shows client exit 0 followed by EPIPE on a late control frame.
No error/partial-drain path was weakened. Fixture forced-kill fallback, daemon
startup-timeout injection, absent/unreadable tools, and all required-syscall
failures were not exhaustively fault-tested; cleanup success was observed for the
actual baseline, refusal and mutation runs.

## Stage applicability and remaining work

Section 1 tasks are complete as observations. Section 2 remains unchecked and
blocks archive/transport acceptance: protocol-aware completion needs review before
any bounded two-pair continuation. Delta spec sync: needs sync; no archive ran.
WBS production design tasks, protected installation, source-memory authority and
production transport selection remain incomplete.

Full `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build`
were **not run** on this laptop to preserve the authorized serial lightweight
scope. Scoped project ESLint/TypeScript checks, h2puni gate/build/install, browser,
CI, deployment, privilege changes and production-runtime queries were **not run**.
No public source push is authorized or performed. No full-gate completion is
claimed. The scoped formatter used the repository portable config, so Tailwind
plugin behavior is unverified and irrelevant to these non-UI files. Two attempted
`bunx prettier@3.9.6` invocations failed with EROFS on Bun's cache/temp setup;
running its already-cached CLI with Bun succeeded without installing dependencies.

## Knowledge and handoff

Canonical observations and next boundary live in the harness README. Recommend a
reviewed definition of CRI completion that explicitly addresses late HTTP/2
control frames; simply discarding bytes or accepting crictl stdout would violate
the retained drain invariant. Request independent Astra review through the parent.
