---
status: accepted
---

# Board cards project step progress

A board card represents an existing step node, and its column is a projection of
that node's progress; neither acquires independent status storage or write
ownership. Whole-work-item cards would hide simultaneous step progress, while
persisted card states or native Backlog columns would introduce competing intent:
any later board write must name its step-node subject and use the planning write
boundary, preserving ADR 0027's ownership contract after cutover.

Accepted by the coordinator under the user's standing delegation on 2026-10-06,
not attributed to a new user interview. The first surface is read-only with
Unknown / In progress / Done columns and no lanes; those reversible presentation
choices and their stress cases live in the
[change](../../openspec/changes/read-only-step-board/design.md).
