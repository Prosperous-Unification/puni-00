# Documentation union, 2026-10-28

This documentation-only reconciliation combines the solver checkpoint
`12782d1cb6a4db9059c82fb6d2febcd2932fa2a4` with upstream
`6beace79abb5c7c465fe380bb86b6d19c1f4a061`. Upstream changes 28 Markdown paths
relative to `25b873b1d49c2d2cd3e130958af682e309e9f844`. No runtime source changes
or restoration/parity replays form part of this reconciliation.

Published upstream ADR 0063 remains the organizational-space decision. The
supervisor-exclusion delivery decision moves, with its complete body unchanged
(SHA256 `475d13c17451781a24fc3aa9aa5cf9a2e056997fd994211a22be1aed5b8da9fe`),
from `0063-supervisor-exclusion-does-not-require-an-identity-broker.md` to
[ADR 0066](../../../docs/adr/0066-supervisor-exclusion-does-not-require-an-identity-broker.md).
Five live navigation links follow the rename. Historical executed commands and
prose-only numbering remain as recorded; in particular, the old filename in
`verify-main-docs-20261027.md` names the file used by that historical command.
The solver-first tasks checkpoint remains intact apart from its navigation link.

CONTEXT retains upstream planning terminology and the dependency-aware start,
addressing, activation and supervisor terms. The prod runbook and MCP tasks keep
both disjoint additions. MCP verification retains both appended historical
sections verbatim, including their original source epochs. Future planning text
and manual instructions do not authorize implementation, architecture adoption,
MAIN integration or deployment. Earlier factory16/command48/command228 evidence
and solver/restoration evidence retain their recorded source boundaries.

Actual local checks before the merge commit:

- Prettier check: all 34 current changed Markdown files passed.
- OpenSpec full validation: 309 passed, zero failed (291 changes, 18 specs).
- OpenSpec scoped validation: cross-project-dependencies, wbs-calendar-ranges,
  wbs-custom-permissions, wbs-mcp-agent-surface, wbs-permissions,
  wbs-step-catalogue and wbs-work-packages each passed.
- `NX_DAEMON=false NODE_OPTIONS=--max-old-space-size=8192 bunx nx run tool-devsync:check:docs --skip-nx-cache`:
  passed, including four ADR/retired-root tests and working root-migration check.
  Its first sandbox attempt stopped at the read-only Nx filesystem boundary;
  the unchanged command passed with workspace-cache/scratch write access.
- `bun run tools/tool-git-hooks/src/hooks/doc-caps.ts`: exit 0.
- Source checks: all 66 ADR numbers unique; all five corrected live links resolve;
  supervisor ADR body exact; historical command file unchanged; solver tasks equal
  the checkpoint apart from the link; no conflict markers in changed Markdown;
  all tracked non-Markdown bodies equal the checkpoint.

Private evidence prefix: `/tmp/puni-r18-docs-union-actual-20261028`.
Full command arguments are recorded in the format/OpenSpec receipts. The files
below bind these local observations; they are not a full CI or host gate claim.

- `format.log`: SHA256 `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`.
- `openspec-all.json`: SHA256 `5055c2bcdfee8c6f880ea67f861ba323d5c40ed81ecfb905137efae339031cd4`.
- `openspec-scoped-receipts.json`: SHA256 `94e36589592bb6081bafe317e2a193c15568d2217abc631ad2a10a9967670db7`.
- `check-docs.log`: SHA256 `c5825461009440722087476e506b0d7827399a1d66cccc33946f7234d4d12128`.
- `source-checks.json`: SHA256 `fd703d0079b5d26d6cd6e62ef2fe9aa36dd91b03ad4f3ddaa7e740a2555f755e`.

Normal-hook merge commit, fresh CI and any required canonical host gate remain Root-owned.
