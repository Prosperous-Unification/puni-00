# A space is a lens: membership is a pair with a position and owns nothing

**Status:** accepted, 2026-09-29 (WBS 010.4.15). Change: `openspec/changes/add-spaces`.

A **space** groups an organization's projects for reading together. We store it as a row owned
by one organization, and its membership as `space_project(space_id, project_id,
organization_id, position)`: a pair with a position and nothing else. A project may sit in many
spaces. A space owns nothing: deleting it, or removing a project from it, changes no project,
and deleting a project removes it from every space by cascade.

The membership row carries the organization and references both `space(id, organization_id)`
and `project_organization(resource_id, organization_id)`, so a pair across organizations has no
parent and SQLite refuses it whatever the service does. Membership edits are routes, not plan
commands: they edit no plan, so they are not journalled and have no undo. The per-organization
**All projects** is virtual, with no row.

This is hard to reverse: once spaces hold memberships, turning them into containers would
change what deleting a space means for data people already rely on, and a nested or
single-parent model would need every membership rewritten.

## Considered Options

- **A project belongs to one folder or portfolio.** Rejected: a project read in a quarter's
  view and a customer's view would have to be copied or chosen between.
- **A space owns its projects** (deleting it deletes them, or projects nest under it).
  Rejected: a reading tool would become a destructive one, and the project, which is
  organization-owned (organization ownership, `add_organization_ownership`), would gain a
  second owner.
- **Membership as a plan command with undo.** Rejected: it is not a plan edit; the calendar
  marker routes are the precedent.
- **Same-organization membership enforced only in the service.** Rejected: one missed filter
  would join tenants; the composite references make it structural.
- **A stored All projects space.** Rejected: it would need a row per organization kept in step
  with every project create and delete, for a set the project list already answers.
