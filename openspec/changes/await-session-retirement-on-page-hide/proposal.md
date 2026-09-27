# Await the session's retirement on page hide

On `pagehide` the bootstrap takes the React root down, and `SignedInApp`'s cleanup starts
`sessionOwner.leave()`; the application slot's `retire()` then runs beside it without waiting. A
persisted restoration can rebuild while the old session's project is still closing, and a session
retirement that fails there is seen by nobody (WBS 050.10, `4334fc49-e143-4671-af58-28cfd5f35423`;
task 14 of `adopt-frontend-lifetimes`).

## Outcome

The application owns a retirement join, `ApplicationServices.retirements`, reached by a component
through `useRetirementJoin` and never as a bag (rule K2). The signed-in region's cleanup hands its
session's retirement to it, as a settlement that fails when that leave left the session owner
terminally fatal where it was not before. The application runtime's close waits for every joined
retirement under the application's own budget and fails, terminally, when one failed or outran it;
a restoration queues behind that retirement and draws the fatal page instead of rebuilding. The
bootstrap keeps taking the root down before it retires the application, so the region's cleanup
finds the application live.

## Non-goals

- No change to how the session or the project retires, or to log out.
- No new reporting path: a failed application retirement is drawn as the slot's fatal state, as any
  other is.
- A session already drawn as fatal while the region was mounted does not fail the application again.

## Constraints

Additive to the application runtime's surface; the delivery architecture check still judges
`ApplicationServices` by its members. The new interleaving — a region's session, the application's
retirement and a `pageshow` — is covered by extending the bootstrap's generated model.
