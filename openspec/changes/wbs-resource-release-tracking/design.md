# Resource release tracking on merged WBS

## Scope decision

The user asked to implement resource releases with currently merged capabilities. A fresh
fetch on 2026-10-25 confirmed that main has declarations, claim occupancy/leases and
compute-provider reports, but not the host-wide Dash reservation and settlement controller
required by the [full design](../wbs-resource-release/design.md).

This increment defines operational reporting without a competing physical capacity ledger.
The user subsequently selected tracking plus automatic runtime cleanup; the companion
[Dash implementation](../dash-resource-cleanup/design.md) supplies that runtime and its
privileged projection in the same feature. This document describes the `reported` source;
manual reports cannot claim independently verified physical release.

## Records and state

A resource use has a server identity and immutable organization/project attribution,
resource/work-item/name/unit/provider snapshots, responsible person, agent run, display
locator, units and optional step/attempt binding. Its source is `reported`. Two physical
copies on the same leaf are separate reports and never collapse to the leaf's logical
occupancy.

The state is `active | cleanup_pending | blocked | retained | release_reported`. A revision
orders mutations. History stores the registration and every subsequent event with actor,
time, reason and optional evidence. Retention stores its responsible owner and review
deadline. Retention is outstanding responsibility, not a reported release.

Explicit transitions:

- Active use: request cleanup or retain with the required metadata.
- Pending cleanup: report a blocker, retain, or report release with evidence.
- Blocked or retained use: request cleanup again.
- Reported release: terminal; a repeated identical event is replayed, not appended again.

A release report requires a reason and evidence reference. Evidence is recorded for review;
WBS does not execute it, fetch arbitrary URLs or certify its content. No transition deletes
files, frees claim occupancy or changes schedules. Locator and evidence are displayed as
untrusted text, never commands or executable markup.

## HTTP contract

The shared descriptors live in
`libs/wbs/domain/contracts/src/http/resource-use-shapes.ts` and are exported through
`@wbs/contracts`.

| Descriptor               | Route                                                | Response                     |
| ------------------------ | ---------------------------------------------------- | ---------------------------- |
| `registerResourceUse`    | `POST /api/projects/:id/resource-uses`               | `201 { use }`                |
| `listResourceUses`       | `GET /api/projects/:id/resource-uses`                | `200 { uses, nextCursor }`   |
| `appendResourceUseEvent` | `POST /api/projects/:id/resource-uses/:useId/events` | `200 { use }`                |
| `readResourceUseHistory` | `GET /api/projects/:id/resource-uses/:useId/history` | `200 { events, nextCursor }` |

Registration accepts `requestId, resourceId, workItemId, agentRun, responsiblePersonId,
locator, units` and an optional `stepId, attemptNumber` pair. References are checked
against the admitted organization/project. A machine principal cannot impersonate another
responsible agent.

Event writes accept `eventId, expectedRevision, kind, reason` and applicable evidence or
retention metadata. Kinds are `cleanup_requested | cleanup_blocked | retained |
release_reported`. Both lists support bounded cursor pagination; uses also support
work-item and state filters.

An identical id/body/actor replay returns its recorded answer. Conflicting replay and stale
revision return conflict. History insertion and current-use update commit atomically under
the existing coordinator. Actor and timestamp come from the admitted principal and server,
not editable client claims.

## Access and lifetime

Reads require project read access and writes require project write access through the
normal organization and credential policies. A viewer cannot mutate, a foreign organization
cannot inspect locators, and machine credentials retain their existing principal limits.

Tracking history does not cascade with work-item, attempt, resource or project deletion.
Snapshot identities remain attributable. When the live project no longer exists, only an
admin of its recorded organization can read or update those orphaned uses through the
same endpoints. Missing records never turn into a permissive legacy access context.

History is outside undoable plan state. Undoing a claim/attempt operation cannot remove a
release report or recreate a physical resource. Existing schedule inputs, hashes and logical
claim occupancy remain unchanged.

## Mandatory cleanup signal

Integrated lifecycle hooks mark matching active uses `cleanup_pending` when an attempt ends
or its claim is released, including the existing lease-expiry path. The history names the
trigger. Matching includes the actual run/step/attempt scope; one agent ending must not request
cleanup of another agent's resources. Partial claim release must respect remaining claims
for the same use's ownership.

These hooks request cleanup only. Worker death or expiry never manufactures
`release_reported`. Repeated triggers are idempotent, and retained uses keep their explicit
continuing owner. Mutations occur in the command/store transaction, not as side effects of
a GET. Uses without a matching execution binding can be requested explicitly.

## UI

A focused resource-use panel sits within the existing Resources screen. It shows resource,
task, responsible person/run, location, units, state and retention details, with expandable
event history. Actions request cleanup/retry, report a blocker, retain, and report release
with evidence. Registration is exposed to agents through the API/MCP contract.

The screen states that these are reports and that requesting cleanup does not delete files.
It distinguishes an empty registry from verified absence of resources. Tracking failure is
shown locally and does not erase the existing resource editor. Paging, loading, refusals,
conflicts and stale async responses on project changes have explicit behavior.

## Verification

Real composed SQLite tests exercise routes, access checks, state transitions, idempotency,
lifecycle hooks and history preservation. Frontend tests exercise the real panel and parent
integration. Watched guard mutations prove selected safety checks can fail. Typed contracts,
affected lint/typechecks, migration checks and OpenSpec validation are required.
