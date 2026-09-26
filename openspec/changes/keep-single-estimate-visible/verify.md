# verify — keep-single-estimate-visible

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 121 passed, 0 failed. This change was valid; the CLI emitted an informational archive warning because the main wbs-estimate-cell spec is absent. File-scoped bunx prettier --check exited 0 for every new file.

| Command                                                                                | Result                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bun install --frozen-lockfile                                                          | Exit 0; checked 1602 installs across 1447 packages, no changes.                                                                                                                      |
| env -u CLAUDECODE bun test ./apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx | Exit 1 before assertions: TypeError: vi.hoisted is not a function at line 36; 0 pass, 1 fail, 1 error. The earlier review's makeRedactionPolicy export error did not reproduce here. |

## Planned checks — pending implementation

- **Pending:** Flip the line-934 assertion first and watch the focused Vitest/component test fail; use the project's Vitest runner because plain Bun test currently stops before assertions.
- **Pending:** Cover saved 5 after blur/refetch, parent roll-up, differing result, refused input and incomplete drafts; run focused component and Chromium checks.
- **Pending R5 proof:** Inject transparent resting input text; the saved-single-number test must fail on visibility. Restore and add an adjacent Proof: comment with the observed failure.
- **Pending R5 proof:** Restore the duplicate final span; the single-reading test must fail. Restore and record its observed output.
- **Pending:** Format, lint, typecheck, OpenSpec validation and the required host gate. No application test or host gate has passed for this packet at spec time.
