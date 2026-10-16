# PR 518 restack verification

Verified 2026-10-16 in isolated checkout `/tmp/f9-518-restack`. The sampler head
`fdcfb17fcf15c126bf04efc6bcdcc2a4a94ef425` merges the approved HTTP CI repair
`25bea2ecf65f20f4e30653f27379d6bde47690a8`, sharing the old parent
`e7201df07f7e72f5a791a6f8546fe213ea320aeb`. Both ancestries are preserved by a merge
commit. No implementation, test, specification or prior receipt blob was edited.

## Exact union

The two branches changed disjoint paths. Before adding these restack receipts, the merged
tree was `37e5e517f3bd0c9bcc3b687a169dd8f272c0fee8`. A fresh Git comparison verified
that its paths are the exact union of both branches' changed paths relative to the old
parent, and that each path's blob equals its source branch's blob:
[machine-readable path inventory](evidence/restack-union.json). Final comparison additionally
permits only this document and the five `restack-*` receipts in this change's evidence
directory. All sampler blobs, including the same-basename executable identity repair,
remain byte-for-byte identical to the reviewed sampler head. All approved CI repair blobs
remain byte-for-byte identical to the reviewed HTTP head.

## Scoped checks

- `FORCE_COLOR=1 bun test tools/tool-devsync/src/k3s/forge-process-observation.test.ts tools/tool-devsync/src/k3s/forge-http-observation.test.ts tools/tool-devsync/src/k3s/forge-recovery-check.test.ts`: 59 passed, 0 failed, 147 assertions; [output](evidence/restack-focused-tests.log).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-devsync --skip-nx-cache --output-style=static`: passed, including six prerequisite tasks; [output](evidence/restack-nx-scoped.log).
- `bunx prettier --check` on the six changed TypeScript files, `docs/infra/local.md`, the sampler change Markdown artifacts and spec, and HTTP verify document: passed; [output](evidence/restack-format.log). This restack document also passed the same formatter after creation.
- `bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`: 223 passed, 0 failed; [output](evidence/restack-openspec.json).
- Final Git parent/blob/path assertions, clean working tree and `git diff --check`: passed; exact commit and tree are supplied in the review handoff.

The focused tests used approved loopback access for local fixtures. Dependencies were
reused via the existing sampler checkout's node_modules symlink; no frozen install is
claimed. Nx receipt line endings are normalized to LF. No new safety checks were introduced;
the original watched negative proofs remain unchanged in both parent changes.

Full tool-devsync tests, full-tree formatting, host gate, live sampling, lab operations,
push, merge to main and deployment were not run. Existing F9 acceptance, historical OOM
attribution and remote-sampler limitations remain. Source checkouts were not modified.
