# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      bun:test (be-01, gw-01, libs, tools)   638 pass  0 fail
      fe-01 (vitest)                         136 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all
✓ change/prove-the-gateway-reaches-be-01
Totals: 10 passed, 0 failed (10 items)
```

## The finding itself, observed live

be-01 and gw-01 run from source on this machine (`nx run be-01:serve`,
`nx run gw-01:serve`), gw-01 restarted with
`INTERNAL_AUTH_SECRET='wrong-secret-32-characters-long!!'` — a gateway that fails
every message a client sends. **Every existing check still passed:**

```
$ SMOKE_COLOR=blue SMOKE_BE_URL=… SMOKE_GW_URL=… bun run tools/tool-smoke/src/health.ts
[smoke/health] ok 200 be-01 http://localhost:3100/health
[smoke/health] ok 200 gw-01 http://localhost:3200/health
[smoke/health] ok 200 fe-01 http://localhost:3100/health
[smoke/health] ok 200 internal-forward http://localhost:3100/internal/forward
```

gw-01's `/health` is 200 because its probe of be-01's `/health` is an
unauthenticated GET. `internal-forward` is 200 because the smoke posts it itself,
holding the right secret. The new check, same moment, same processes:

```
[smoke/ws] ok ping — {"type":"pong"}
[smoke/ws] FAIL backend-hop — gw-01 could not forward to be-01:
           {"type":"error","code":"backend_unavailable","retry_after":5}
```

And against a correctly configured pair:

```
[smoke/ws] ok ping — {"type":"pong"}
[smoke/ws] ok backend-hop — gw-01 reached be-01 — frames:
           {"type":"presence","users":["smoke"]} |
           {"type":"resume_denied","subscription":"project:00000000-0000-0000-0000-000000000000",
            "reason":"out_of_range"} |
           {"type":"resume_ack","replayed":{}}
```

`out_of_range` is be-01's answer, read from `event_sequencer` — a gateway that
never reached be-01 cannot produce it.

## Every check, and the fault that broke it

| Check                                 | Fault injected                                             | What the run reported                                                                                               |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A refused forward fails the probe     | the `backend_unavailable` condition replaced with `false`  | `fails when the forward is refused` and `fails when the forward error arrives after the resume settled` both failed |
| `unavailable` is not a healthy answer | the `resume_denied` reason condition replaced with `false` | only `fails when gw-01 could not reach be-01 to resume` failed — every resume answered out of gw-01's catch passed  |
| A late forward error is still caught  | the drain replaced with an immediate `stop(true, …)`       | only `fails when the forward error arrives after the resume settled` failed                                         |
| `ForwardClient` is exercised at all   | the forward envelope never sent                            | only `asks be-01 something only be-01 can answer` failed — the resume half alone still passed                       |
| Silence is a failure                  | (none needed — asserted directly)                          | `fails when nothing answers at all` reports the frames that did arrive                                              |

The fourth row is the finding in miniature: with the envelope removed, the probe
still proved gw-01 could reach be-01, and still exercised no `ForwardClient`.

## What this does not cover

- **That a successful forward did anything.** be-01's `onForward` is a no-op and
  echoes nothing, so a working forward is the _absence_ of an error frame for 500ms
  after the resume settles. A forward failure slower than that drain is missed.
  Making this positive needs a response from be-01 that the socket can see, which
  is a protocol change, not a smoke change.
- **A real deploy.** The smoke runs from `tool-deploy` after a swap, inside a
  throwaway container on `wbs-net`, reaching Caddy by container DNS. This ran
  against `SMOKE_WS_URL` pointed straight at gw-01 on localhost — the documented
  escape hatch, which deliberately skips Caddy's routing and `stream_close_delay`.
  Task 3.2 is the real one and is not done.
- **A wrong `BE_URL`.** Not injected here; gw-01's own `/health` already 503s for
  it, and that has its own proof in the health-endpoints change.
- **Two gateways.** The probe opens one socket. Nothing checks that both colours
  during a swap can reach be-01.
