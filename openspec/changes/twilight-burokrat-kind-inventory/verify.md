## Commands

- `TOOL_WIKI_TRUSTED_NODE_MODULES=<repo>/node_modules env -u CLAUDECODE bun test --preload ../../../../tools/test/scratch/preload.ts src/rules/kind-inventory.test.ts` from `apps/twilight-structure/twilight-burokrat/cli`: 21 pass (2026-09-27).
- `bunx nx run twilight-burokrat:typecheck` and `twilight-burokrat:lint:fast`: pass.

## R5 proofs (2026-09-27, each fault injected alone and reverted)

| Fault                                                                     | Observed failure                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `check.ts` passes `[]` instead of the read inventory                      | K2 finding test received `findings: []`                       |
| inventory read from the checkout with `readFileSync`                      | selected-revision test received `findings: []`                |
| absent inventory returns `[]`                                             | absent test received `unevaluated: []` for F1                 |
| JSON error rethrown unchanged                                             | malformed test reason became `JSON Parse error: Expected '}'` |
| duplicate, stale and suffix checks each disabled                          | each test received `unevaluated: []` for F1                   |
| composition-root conflict disabled                                        | unit test: function did not throw                             |
| F1, K2 (graph rules), MOD-LAYOUT guard each return an empty observed list | malformed test received `unevaluated: []` for that rule       |

The unreadable case deletes the committed blob's loose object, so `git cat-file` fails for the selected revision.
