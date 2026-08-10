# Teams label the work, people do it

## Why

Dany, 2026-08-06: a "service/team" column that behaves like a Jira label —
a dropdown with search you can also type into, and what you type is added to a
list global to every project, which anyone can add to. Then assignees, one per
phase per work item, picked the same way; a person can belong to more than one
team; somebody added with no team is a "free agent"; and "when just one is
assigned it is assumed they do both dev and QA".

The plan can say what the work is, how long it takes and when it happens. It
cannot say whose it is.

## What Changes

**A global directory of teams and people**

- New `service_team` and `person`, both with unique names, both **global**
  rather than per project. The same teams do work across projects, and a list
  per project would be the same names typed again with typos between them.
  That is Dany's call, and its cost is that everyone on this deployment can
  see every team and person anyone has added — a directory, not a secret.
- `person_team` joins them, many-to-many: "one assignee might be from
  different service/teams".
- A person with no memberships is a **free agent** — computed from the absence
  of rows rather than stored as membership of a magic "Free agents" team. A
  real row could be renamed, deleted, or given work of its own, and the
  default would then mean whatever somebody last did to it.
- Adding is idempotent by name, at the database. The picker's "type it if it
  is not in the list" cannot make two `Platform`s, and neither can two people
  typing it in two browsers at the same moment.
- `GET`/`POST` on `/api/teams` and `/api/people`, open to any authenticated
  account: the directory belongs to no project, so gating it on one project's
  write access would stop a reader naming a team while working in another.

**Work items carry a team, and an assignee per phase**

- `work_item.service_team_id`, nullable — a label on the work.
- `assignment` keyed by work item and role, so at most one Dev and one QA.
- **The assignee is not constrained by the work item's team.** Dany's call:
  "keep people and service/team lists decoupled for the work item". A platform
  engineer picking up a piece of billing work is an ordinary Tuesday.
- Exactly one assignee is reported as `doesEveryPhase`, which the table shows
  in the empty phase's cell. It is a **reading** of the assignments, not a
  second row written on somebody's behalf: assign the other role and the
  assumption ends by itself, and nobody is ever recorded against work they
  were not given.
- A person typed in against a work item that has a team joins that team. Typed
  in against one that has none, they are a free agent.

## Non-Goals

- **People are not accounts.** The people a plan assigns work to are mostly not
  users of this tool, and requiring them to be would make the field unusable on
  the day it is needed.
- **No per-project team lists**, no renaming or deleting teams and people yet:
  adding is what was asked for, and removal needs a decision about what
  happens to the assignments pointing at them.
- **No capacity, no availability, no workload.** Knowing who does what does not
  yet change any date.
