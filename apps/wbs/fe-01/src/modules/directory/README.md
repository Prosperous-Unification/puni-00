# Directory

The account-wide directory this deployment holds: its people, teams, tags, services and work item
types, the rule for which read may install, and the one way a change to it is run.

A resource-service. It is plain TypeScript and imports no React, which is rule F1 of the code
organization design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`, and it
exposes the one store contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.

## What it owns

- The five vocabularies as one snapshot, replaced only when something in it moved.
- The newest-read rule: three call sites fire a read, none gated on the others, and only the
  newest may install what it fetched.
- The write runner: raise busy, clear the problem, run the change, turn a throw into a refusal in
  the directory's own words, refetch either way, lower busy.
- Which route each of the five kinds renames and removes through.
- Pointing at a replacement client without losing what it already holds.
- Withdrawal: built with its owner's `isActiveReader`, it sends nothing and shows nothing new once
  that answers no, so a signed-out or replaced session's directory keeps what it held.

## What it does not own

Any gesture. Which several operations make up one thing a person does belongs to the
directory-management feature-service beside it, and the page talks only to that. Nothing here is
optimistic, and nothing here opens a socket.

## Relationships

The exported types are in `contract.ts`; the service is `directory.resource.ts`. It has no
`module.ts` of its own: the directory-management module registers it as its private `directory`
binding, in `apps/wbs/fe-01/src/modules/directory-management/module.ts`. The plan pickers are
expected to share this resource, which is why it is a module of its own rather than a private
member of the feature.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suite is
`directory.resource.test.ts`. The behaviour this extraction preserves is proved by
`apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, which runs in the `test` target
of the same project.
