# Checks that cannot fail — puni-00

The R5 entries recorded here after the wbs-tool-v1 history was merged in. They continue
[the inherited catalogue](checks-that-cannot-fail.md#r5-catalogue-heading), which is pinned
block-for-block by `root-migration.v1.json` and so cannot take additions. With these, the
count is **thirty**.

Two more on 2026-09-06 in `twilight-review-hardening` and the Twilight plan review, and
**neither shipped**. Marking each generated workflow copy with the source a human should edit
meant inserting a line under the frontmatter, and the first cut re-parsed the frontmatter at
insertion time and threw `Missing frontmatter for marker` when it did not match. That branch
is unreachable: `readSource` has already refused a source without frontmatter, and the command
files' headers are built by the generator itself. The `Proof:` comment beside it said as much in
prose, which is a comment admitting the check cannot fail. Restructured so the caller passes the
header length it already has, and the guard is deleted. **A guard whose comment has to explain
why it can never fire is the finding, not the mitigation.** And the twilight-v1 schema's own
proof was the other one: `tasks.requires` gained `design` with a `Proof:` citing a test that
wrote `tasks.md` by hand and asserted apply was `ready`, so it never asked the CLI the question
the edge is about. Asked properly, `status --json` with `design.md` absent reports
`tasks: blocked, missingDeps: ["design"]`, and the same test watched `Expected: "blocked" /
Received: "ready"` with the edge removed. The schema said design was OPTIONAL in the sentence
above the edge that made it mandatory; it is always present now, applicability-only when trivial.

One more on 2026-09-10 while syncing upstream `87bf2931`, and it **shipped upstream** —
the twenty-eighth. The new shared `tools/test/scratch` helpers had no TypeScript project,
and the relevant tool lint targets named only their own `src`, so upstream CI was green while the
commit hook refused both helpers as "not found by the project service". Giving them a
project and adding their directory to `tool-git-hooks:lint` exposed a real numeric-template
lint error. The preload was outside the compiler too: a deliberate string assigned to a
number passed until its directory joined the hooks spec project's include, then failed
with TS2322. The lint regression runs the configured CI command and reads its reported
paths; deleting the helper argument fails that assertion even though the command exits 0.
**A shared helper needs an owner in every gate that claims to cover it.**

One more on 2026-09-19, found while planning the plan writer's extraction, and it **is on
main** — the twenty-ninth. In `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` the gesture
runner checks `isCurrent()` on its success path, after the ledger is read and before the covering
reread, and the `Proof:` comment beside it says that dropping the check made an old arrangement
toast into its busy replacement in `does not announce an old arrangement in its busy replacement`.
With that one line removed, `plan-read-and-write.test.tsx` passed 88 of 88 under the UTC suite:
the post-reread check now catches that departed reader, so the named test no longer pins the
guard and the comment describes a failure that no longer happens. The guard is not redundant,
though. A Codex review built the case that separates the two checks: the feed owner is replaced
while a successful gesture is in flight and the reader stays active. With the guard the gesture is
refused without a reread; without it the gesture lands and rereads the tree. No test held that
case. The plan writer's extraction adds it as a unit test and proves the guard against it, and the
stale comment is rewritten only after that failure has been watched. **Eighty-eight green tests
showed a coverage gap, not an unbreakable check; the planner first read them the wrong way round.**

One more on 2026-09-20, found while planning batch 3, and it **shipped** — the thirtieth. The
h2puni gate is the repository's completion gate, and `bin/h2puni-gate-steps.sh` never installed
anything: it ran OpenSpec validation and five Nx steps against whatever `node_modules` an earlier
gate had left in the shared tree. On 2026-09-20 that was 2026-09-18's install, without `di-bag`,
`application-exception` or `caught-object-report-json`, so every host gate since batch 1 had
reported green about a commit whose locked dependencies it had never read, and passed only
because nothing that executed there imported the three new libraries. The first batch 2 group
gate finally failed `apps/wbs/be-01/src/production-entrypoint.test.ts` on
`Could not resolve: "di-bag"`, and the planner installed by hand. CI installs at the top of its
gate job; the host gate did not, and no test asked whether it did. **A gate that reads a tree it
never assembled is reporting about a different commit than the one it names.**
