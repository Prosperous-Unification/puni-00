# Main df8 integration verification

Merged target: reviewed dependency and CI head `05fd381f5664945478a1da07d9e58919742916d2` with main `df8b9bcc3529abb6e78adfbf2b871a4ead33a03a` in an isolated worktree. Four textual conflicts combined the dependency admission and delivery reader in `app.ts`, both fixture seams in `organization-harness.ts`, dependency and delivery MCP descriptions, and eight-shard scheduling with the new phase budgets. An independent architecture ruling set the combined browser path to 55/15/25/5/10 minutes; [the budget amendment](../separate-browser-setup-budget/verify.md#eight-shard-integration-amendment) records its watched YAML faults. No application behavior was redesigned for the merge.

Focused local results after frozen install:

| Check                                                                            | Observed result                                                                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Shared delivery observation/timing and GitHub adapter tests                      | 113 pass, 249 assertions                                                                                               |
| Delivery, project address and project claims controllers                         | 60 pass, 568 assertions                                                                                                |
| Store claim/address observation and connected service tests                      | 48 pass, 543 assertions                                                                                                |
| Delivery panel component                                                         | 19 pass                                                                                                                |
| Mounted HTTP boundaries, delivery shapes and gate                                | 55 pass, 351 assertions                                                                                                |
| Generated MCP document and tool inventory, after emitting ignored `openapi.json` | 47 pass, 462 assertions; generated inventory 91 matches README                                                         |
| Module labels and workspace project inventory                                    | 24 pass, 43 assertions                                                                                                 |
| Browser workflow and dedicated config routing                                    | 11 pass, 132 assertions; one routing case passed with 18 filtered                                                      |
| TypeScript builds                                                                | `apps/wbs/be-01`, `apps/wbs/fe-01`, shared delivery, GitHub delivery adapter, tool-git-hooks and tool-devsync exited 0 |
| Configured lint                                                                  | Eight affected Nx project lint targets exited 0; budget-test scoped ESLint exited 0 after its final edit               |
| Changed-file format and OpenSpec                                                 | Prettier check exited 0; `openspec validate --all --json` reported 285/285 passed                                      |

The combined `app.routes.test.ts` run had 22 passing cases and one sandbox `EPERM` on a local `Bun.serve` listener; the separately run delivery controller cases passed. A broad frontend Playwright config Vitest run had 36 passing cases and one `spawnSync bun EPERM` sandbox refusal; the exact dedicated routing case passed when filtered. An attempted `bun test` of Vite's Vitest file failed because Bun's test runner has no `vi.hoisted`; the relevant file was rerun under Vitest. No full browser suite, final synthetic PR pipeline, host gate, Docker, workflow dispatch or deployment was performed in this lane. Final required verdicts and hosted timing remain open for the parent integration.
