# Design

## D1 — Replay travels in the resume response, not through `/internal/push`

The superseded `wire-be-01-runtime-layer-a` design had be-01 push replayed events
back to gw-01 through `PushClient`, the same path a live broadcast takes. That is
wrong here for a reason that only shows up with more than one reader:
`/internal/push` fans out to **every** socket subscribed to the subscription. One
client reconnecting would replay its missed events into every other client's
socket, and since fe-01 refetches on any event, one laptop waking from sleep would
make every open browser refetch once per missed edit.

Targeting would mean adding a connection id to the push contract and a
connection→socket registry in gw-01. gw-01 already holds the socket that asked —
it is the one it is about to send `resume_ack` to. So the events ride back in the
resume response and gw-01 writes them to that socket. No registry, no new
addressing mode, and replay cannot reach a socket that did not ask for it.

The frames the client receives are byte-identical to live ones
(`{subscription, seq, message}`), so the client needs no replay branch.

## D2 — Buffer first, log second, deny third

`ReplayOrchestrator.replay(points)` answers each subscription independently:

1. If `sinceSeq + 1` is at or after the buffer's oldest sequence, the buffer can
   serve the whole range — take it. The common case is a four-second dropout.
2. Otherwise ask `EventLogRepo.rangeSince`. The log is authoritative but costs a
   query per subscription.
3. If the log's own oldest sequence is greater than `sinceSeq + 1`, retention has
   eaten the range: `denied, out_of_range`.

An empty buffer is not evidence of anything — a process that just started has one,
and so does a subscription with no events. Only `oldestSeq` distinguishes "the
buffer starts after what you need" from "the buffer holds nothing yet", which is
why the check is on `oldestSeq` rather than on emptiness.

## D3 — The replay cap denies rather than truncates

A replay is bounded at `maxEvents` (256). Past that the answer is `denied,
out_of_range` and the client refetches, which is one request instead of hundreds
of frames that each trigger a refetch anyway. Truncating and reporting success
would be the worse failure: the client would advance its sequence past events it
never saw and never learn it had a hole.

## D4 — `seq: -1` for a project with no events

`GET /api/projects/:id/work-items` returns the latest recorded sequence so a first
subscription has a baseline. Sequences start at `0`, so "no events yet" cannot be
`0`. It is `-1`, which resumes from "everything", and for a project with no events
that is correctly nothing. Returning `null` would push the same decision onto every
caller; `-1` makes `Math.max(seq, lastSeen)` work without a branch.

There is still a window between the tree read and the socket's `subscribe`: an
edit landing inside it is replayed, because the client resumes from the sequence
the read returned rather than from the moment it connected. That is the reason
the field exists.

## D5 — Backoff belongs to the subscription, not to a component

`subscribeToProject` owns the reconnect loop and the caller keeps the same
unsubscribe function across every underlying socket. A React component that
resubscribed on its own would restart the backoff on every render that changed
the closure, which is how reconnect storms are usually written by accident.

Delays are `500ms · 2ⁿ` capped at `15s`, each multiplied by a random factor in
`[0.5, 1)`. Jitter matters more here than the curve: a gateway restart drops every
client at once, and an unjittered backoff reconnects them all in the same
millisecond.

The loop stops only when the caller unsubscribes. A socket that cannot reconnect
is not an error the table can act on — retrying is the only useful behaviour —
but the caller is told, so the table can say the connection is down instead of
showing stale rows as though they were live.
