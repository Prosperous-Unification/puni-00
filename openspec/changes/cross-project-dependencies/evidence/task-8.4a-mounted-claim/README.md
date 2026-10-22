# Mounted connected claim and tree publication

The independently approved task 6.3 admission packet was combined with the
task 8.4a connected tree presenter and corrected foreign-person holder packet
on a disposable checkout based on `ab11f0950`. The two tree commits applied
with two explicit merge resolutions: retain both admission and tree imports in
`work-item.resource.ts`, and retain both sets of SQLite captured-read tests.

The mounted command creates two projects with a remote FS prerequisite, finishes
the predecessor, and claims the target step without assignment. It holds the
target-project push response after commit, then observes the claim, in-progress
statement, one journal entry, no assignment or occupancy, and release of the
writer turn before delivery. Finally it observes HTTP 200 and the target's
durable `tree_replaced` event. A different project subscription is delivered
normally; it cannot satisfy the held target push.

`bun test apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts`
passed **9/9, 69 assertions** on the combined source before the final witness
lint correction. The restored targeted witness then passed **1/1, 11
assertions** in [restored-green.log](restored-green.log). With the production
connected branch of `WorkItemService.tree` replaced by a throw, the same
targeted mounted witness failed **0/1** before the target push in
[publication-fault.log](publication-fault.log); the injection was removed before
the restored pass. Frontend/core/SQLite/backend TypeScript builds and the
changed witness/JSDoc ESLint and Prettier checks passed on the combined source.
The tree source itself has a separate [Astra review](../task-8.4a-foreign-person-holder-review.md).

This closes the specific post-commit connected claim publication gap found in
the admission review. It does not prove assign=true, shared-mode command
publication, restart, unavailable connected trees, component fanout, or the
remaining task 6.3/8.4 matrices. Full gate and CI have not run on this combined
head.
