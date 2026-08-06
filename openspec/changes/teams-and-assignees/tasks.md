## 1. The directory

- [x] 1.1 `service_team`, `person`, `person_team` and `assignment` tables plus
      `work_item.service_team_id`; migration + `down.sql`.
- [x] 1.2 `DirectoryRepository` with tests: adding by an existing name returns
      the existing row, a person holds several teams, no teams is an empty
      list, one assignee per role, and the foreign key refuses an assignment
      to somebody who is not there.
- [x] 1.3 **Negative tests, both watched failing:** `addTeam` without
      `onConflictDoNothing`; and the assignment delete narrowed to the role
      alone. The second needed a second work item in the test before it could
      fail at all — the first version of that test passed with the bug in.
- [x] 1.4 `DirectoryService` and `/api/teams`, `/api/people`.

## 2. Work items

- [x] 2.1 `serviceTeamId` on the patch route; `PUT
/work-items/:id/assignees/:roleId` with `null` to clear.
- [x] 2.2 The tree reports `assignees` and `doesEveryPhase`, derived.
      **Negative test:** report the first assignee regardless of how many
      there are, and watch the two-assignee case fail.
- [x] 2.3 The assignee is not checked against the work item's team, with a
      test that assigns across teams deliberately.

## 3. fe-01

- [x] 3.1 `CreatablePicker`: search, pick, or type a name and add it. "Add"
      appears only when nothing matches exactly. **Negative test:** offer it
      always, and watch the exact-match case fail.
- [x] 3.2 A Service/team column and a `<role> by` column per role; the empty
      phase names whoever is assumed to be covering it.
- [x] 3.3 A person typed in against a labelled work item joins that team.

## 4. Gate and verification

- [x] 4.1 Format, the run-many gate, `openspec validate`, migration lint —
      recorded in `verify.md` with the fault table.
- [x] 4.2 Deploy to dev and exercise the directory against the real database.
