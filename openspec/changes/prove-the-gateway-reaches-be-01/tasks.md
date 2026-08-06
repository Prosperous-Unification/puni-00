## 1. The backend-hop probe

- [x] 1.1 Failing tests in `ws-ping.test.ts` against a scripted gateway: the probe
      sends the forward envelope _and_ the resume, and reports ok on
      `out_of_range` + `resume_ack`.
- [x] 1.2 **Negative test:** `unavailable` on the denial fails the check. Watch it
      fail with the reason condition replaced by `false` — that is the whole
      distinction the probe rests on, since gw-01 sends `resume_ack` either way.
- [x] 1.3 **Negative test:** a `backend_unavailable` error frame fails the check,
      including one that arrives _after_ `resume_ack` — the two calls are
      independent and gw-01 does not serialise them. Watch the late one pass with
      the drain window removed.
- [x] 1.4 **Negative test:** nothing answering at all fails, naming the frames
      that did arrive.
- [x] 1.5 Implement `runBackendHopSmoke` in `ws-ping.ts`; run it from `runWsSuite`
      on its own socket, reporting `ping` and `backend-hop` separately.

## 2. Against real processes, not fakes

- [x] 2.1 Run be-01 and gw-01 locally and watch the probe pass, answered by
      `out_of_range` from be-01's database.
- [x] 2.2 **The finding itself, observed:** restart gw-01 with a wrong
      `INTERNAL_AUTH_SECRET` and watch the entire existing health suite — all four
      checks including `internal-forward` — still report ok, while the new probe
      fails. Recorded in `verify.md`.

## 3. Gate and verification

- [x] 3.1 `verify.md`: the uncached gate, the failure-proof table, and the live
      run against a deliberately broken gw-01.
- [ ] 3.2 Run on a real deploy. The smoke only executes from `tool-deploy` after a
      swap, which is a prod deploy — Dany's call, not this change's.
