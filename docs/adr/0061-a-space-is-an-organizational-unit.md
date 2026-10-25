# A space is an organizational unit: a project sits in one space or none

**Status:** accepted, 2026-10-25 (Dany). Supersedes [ADR 0033](0033-a-space-is-a-lens.md).
Change: `openspec/changes/wbs-work-packages` (design E23, E24).

ADR 0033 made a space a lens: a pair with a position that owns nothing, with a project in any
number of spaces. On 2026-10-25 Dany decided that spaces are the organization's structure, its
departments and teams of people, and that they carry settings resolved by the projects
beneath them. A settings level needs one answer per project, so we decided that a project
sits in **one space or none** (`project.space_id`, nullable; none is an organization-level
project, an explicit state and not a default), that the scope chain is organization → space
→ project → work package, and that spaces stay flat for now. Nesting is additive later:
the chain's single space slot (`spaceId`, nullable) can widen to the space's ancestors,
nearest first, without changing what the walk does today. (Corrected 2026-10-25 after the
Codex review of #723, F11: this said "the chain already carries a list of spaces", which the
scalar `spaceId` does not.)

## Consequences

- Slice 3a of `wbs-work-packages` replaces the `space_project` pairs (`space_work_package`
  after slice 1) with `project.space_id` and `project.space_position`. A project that sat in
  several spaces keeps one by a total order: the lowest position among its work packages in
  each space, then `space.created_at`, then `space.id`; each space's kept projects are
  renumbered by that position, then `project.created_at`, then `project.id`
  (`wbs-work-packages` E46). Every other membership is written once to
  `space_project_dropped` with its original position and printed in the window's
  `verify.md`, so none is lost silently.
- Adding a project that already sits in another space is refused with
  `409 project_in_other_space`; moving a project between spaces takes a remove and then an
  add.
- Roll-ups are per space over the projects in it. The **All projects** space still lists every
  project, in a space or not. Deleting a space returns its projects to none; a space owns no
  project lifecycle and grants no access, and it holds its own local settings (space-scope grants stay declared, `wbs-permissions`
  P14).
- 0033's quarter view and customer view of one project are no longer two spaces. That
  reading becomes a filter or a saved view, which is later work.

## Considered Options

- **A home-space column beside the many-to-many pairs.** Rejected: every reader would have to
  know which of the two relations answers which question, and a setting resolved through the
  home space would disagree with the space a reader opened.
- **Keep the lens and add a separate department entity.** Rejected: it adds a second,
  overlapping grouping of projects to an organization with no users yet, and Dany's
  "departments and teams" are exactly what spaces were meant to name.
