## 1. Persist and expand explicit FS links

- [ ] 1.1 Add failing domain cases for whole/step endpoints, parent Cartesian expansion, synthetic slice, zero-duration unknown steps, legacy anchor preservation, valid cross-step work-item apparent cycles and actual slice cycles.
- [ ] 1.2 Implement shared expansion/validation and typed dependency persistence. Add additive `migration.sql` beside `down.sql`, with endpoint/type uniqueness and rollback guard for typed rows; test migration, unreadable/absent state and rollback refusal through the production path.
- [ ] 1.3 Inject a skipped parent pair, stale anchor pin, missing referenced step and rollback guard bypass; watch each negative test fail, restore and add adjacent `Proof:` comments with observed failures.

## 2. Commands, history and transfer

- [ ] 2.1 Add failing HTTP/MCP and batch tests for legacy command compatibility, typed add/update/remove, duplicate/cycle 4xx, stale undo, redo and atomic legacy-to-typed edit.
- [ ] 2.2 Implement typed commands and generated contracts; preserve old command signatures. Add failing copy, duplication, export/import and saved-plan/snapshot tests, then implement versioned serialization and remapping. Coordinate archive version with other changes.
- [ ] 2.3 Inject a lost type/scope during transfer, stale-undo bypass and malformed-import acceptance; watch mounted tests fail, restore and add adjacent `Proof:` comments.

## 3. Schedule explicit FS edges

- [ ] 3.1 Add failing Fast and solver golden cases for FS entering a later successor step, parent expansion, unknown zero-time predecessor and legacy reach coexistence.
- [ ] 3.2 Extend shared graph, Fast placement, solver request and independent publication validator; update canonical hash, contract version and corpora. Test that old cache entries retire.
- [ ] 3.3 Inject one omitted expanded edge or a visual-placeholder duration into the solver path; watch validation/golden tests fail, restore and add adjacent `Proof:` comments.

## 4. Expose the picker and chart

- [ ] 4.1 Add failing component/browser cases for one-click default, Customize without write, editor refusal, chip label, keyboard/mobile focus and collapsed-parent summary.
- [ ] 4.2 Implement picker, editor, cards and FS step arrows using actual schedule ticks; wire hover/focus highlight across surfaces.
- [ ] 4.3 Inject a placeholder-edge anchor or a collapsed self-arrow; watch geometry/accessibility tests fail, restore and add adjacent `Proof:` comments.

## 5. Verify

- [ ] 5.1 Run focused domain, mounted HTTP/MCP, import/snapshot, Fast/solver and browser checks, migration lint/rollback, format, lint, typecheck, build, OpenSpec validation and applicable host gate. Record commands, output and R5 observations in verify.md.
