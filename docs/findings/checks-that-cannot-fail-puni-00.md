# Checks that cannot fail — puni-00

The R5 entries recorded in puni-00 rather than upstream wbs-tool-v1. They continue
[the upstream catalogue](checks-that-cannot-fail.md#r5-catalogue-heading), which is pinned
block-for-block by `root-migration.v1.json` and so cannot take additions. With these, the
count is **twenty-eight**.

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
