## Why

A browser that loses its socket for four seconds stops receiving edits forever.
`subscribeToProject` opens one `WebSocket` and never opens another, so the first
suspend, wifi hop or gateway restart leaves the table showing a project that is
quietly out of date, with nothing on screen saying so. Two people editing the
same breakdown is the entire point of the product; a silent divergence is the
worst failure it has.

The protocol already anticipated this. gw-01 accepts `resume`, forwards it to
be-01, and answers `resume_ack`/`resume_denied`; be-01 records every project
event in a durable log with a per-subscription sequence. But be-01's `/internal/resume`
handler is a stub that answers `{status: "replaying", count: 0}` for every
subscription it is asked about — a fixed answer that cannot be wrong and cannot
be right. The log has been written since the domain landed and has never been read.

## What Changes

**A socket that comes back**

- From: one `WebSocket`, closed is closed.
- To: reconnect with capped exponential backoff and jitter until the caller
  unsubscribes, resubscribing on each open.
- Impact: fe-01 only.

**A resume that replays**

- From: `onResume` returns a fabricated `replaying, count: 0`.
- To: `ReplayOrchestrator` serves the events after the client's sequence from an
  in-memory buffer, falls back to the durable `event_log`, and answers `denied,
out_of_range` when neither can start at the requested point or the range
  exceeds the replay cap. The stub is deleted, and `buildApp` requires the real
  service rather than defaulting to one.
- Impact: `InternalResumeResponse` gains the replayed events. gw-01 sends them to
  the socket that asked, in sequence order, before its `resume_ack`.

**A sequence the client can resume from**

- From: reading a project tells the client nothing about where the event stream
  had reached, so a first subscription has no baseline and every reconnect after
  it is a guess.
- To: `GET /api/projects/:id/work-items` returns `seq`, the latest recorded
  sequence for that project — `-1` when the project has never been edited. The
  client resumes from the highest of that and the last sequence it received.
- Impact: additive response field; no migration.

**Retention that runs**

- From: `runRetention` had no caller outside its own test. The event log grew by
  one row per edit, forever, in the same SQLite file the domain lives in.
- To: a `RetentionTimer` started by `main.ts`, pruning to 1,000 events per
  subscription every ten minutes, reporting a failed sweep and continuing, and
  stopping cleanly on SIGTERM.
- Impact: it also makes `out_of_range` reachable. A refusal that could never
  happen would be a branch nothing ever took.

## Non-Goals

- Applying replayed payloads to the table. It refetches on any event, deliberately —
  reproducing numbering and roll-up client-side is a second implementation of the
  two things most likely to disagree with the server. Replay's job here is to
  answer "did I miss anything", not to carry the change.
- Client→server mutations over the socket. Every mutation is HTTP; `forward` stays
  a pure ack.
- Offline editing, queued mutations, or conflict resolution.
- Presence resume. The roster is answered by `who` on every open already.
