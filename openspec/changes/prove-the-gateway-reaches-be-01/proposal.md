## Why

The smoke's authenticated internal check posts to be-01's `/internal/forward`
itself. It proves be-01's door opens for a caller holding the secret — and says
nothing about whether **gw-01** holds it. A gateway with a wrong
`INTERNAL_AUTH_SECRET` fails every message a client sends and the whole suite
still reports ok.

That is not hypothetical. Run against be-01 and gw-01 on this machine with gw-01
started on a deliberately wrong secret, every existing check passed:

```
[smoke/health] ok 200 be-01 ... ok 200 gw-01 ... ok 200 fe-01
[smoke/health] ok 200 internal-forward
```

gw-01's `/health` closed half the gap in the health-endpoints fix on 2026-08-06 by
probing be-01's `/health`. But that probe is an unauthenticated `GET`: it catches a
wrong `BE_URL` and cannot catch a wrong secret. `ForwardClient` — the class every
client message goes through — is still exercised by no check anywhere outside its
own unit tests.

## What Changes

**The WS suite asks gw-01 to talk to be-01**

- From: one ping/pong, which gw-01 answers by itself without touching be-01.
- To: the same socket also sends the `{subscription, message}` envelope that
  `handleWsMessage` forwards, and a `resume` for a subscription no project can
  own. be-01 answers that with `out_of_range`, read out of its own database; a
  gw-01 that could not reach be-01 answers `unavailable` out of its own catch.
  The two are distinguishable at the client, and only one of them can be faked.
- Impact: `tool-smoke` only. No app change, no contract change.

**The suite reports the two halves separately**

- From: one `[smoke/ws]` line.
- To: `ping` and `backend-hop` lines, both always run, so "the socket answers but
  the gateway cannot reach the backend" is a state with its own name.

## Non-Goals

- **Proving a successful forward did something.** be-01's `onForward` is a no-op
  and echoes nothing, so this checks for the absence of a failure frame within a
  bounded drain. `verify.md` says so under what it does not cover.
- **Removing the direct `/internal/forward` check.** It still proves be-01's half
  of the secret, and it fails for reasons the socket path cannot see.
- **A second socket held open across a Caddy reload.** That is the deploy
  rehearsal, unchanged and still not automated.
