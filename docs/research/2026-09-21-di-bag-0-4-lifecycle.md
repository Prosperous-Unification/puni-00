# DI Bag 0.4.0 React lifecycle research

Research date: 2026-09-21.

## Conclusion

DI Bag 0.4.0 provides enough public shutdown information to implement Puni's
required fail-closed replacement policy, but its React `RuntimeOwner` recipe
chooses a different policy. The recipe reports a disposer failure and still
starts the replacement; with `closeTimeoutMs`, it reports expiry and deliberately
starts the replacement while old cleanup continues. Puni's R5 decision instead
requires a required retirement failure or timeout to fail the transition and
refuse the replacement. This is feasible with 0.4.0, but requires a local owner;
the tagged owner cannot be copied unchanged.

The tagged guide also does not implement BFCache restoration. It begins best-effort
shutdown on `pagehide`, including a potentially persisted navigation, but its
bootstrap installs no `pageshow` handler. If Puni retires all runtimes on persisted
`pagehide`, its accepted fresh bootstrap on persisted `pageshow` remains necessary.

No unresolved library-policy choice remains. The upstream policy is informative
rather than authoritative for Puni, and the repository's R5 rule supplies the
stricter answer.

## Version and source identity

- The installed package in `batch-4-planning/node_modules/di-bag` declares
  version `0.4.0`. Its `package.json` and `README.md` are byte-identical to the
  official `v0.4.0` tag (measured locally with `cmp`; package JSON SHA-256
  `65be0185e16b7cffe483eda78cef85cf56875c05b0fbaa91cc3e77197399b555`).
  [Tagged package metadata](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/package.json)
- The npm tarball ships the README, declarations, implementation, and agent docs,
  but omits `docs/guides/react-integration.md` and the example owner. The installed
  README nevertheless links that guide and describes it as a tested recipe. The
  guide below was therefore read from the official `v0.4.0` tag, not from `main`.
  [Tagged README](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/README.md#L251-L265)
- No later DI Bag version or untagged source is used for a 0.4.0 claim. React and
  browser sources are current first-party platform documentation read on the
  research date; they are identified separately below.

Supporting verification note: the official tagged package metadata, README,
React guide, owner, bootstrap, owner tests, and relevant `src` contracts were
retrieved over HTTPS on the research date. The installed package metadata and
README both matched their tagged files with `cmp`; the tagged React guide's
SHA-256 was `755fb6fad82658497b4442627a8efc6e84562066e7e58551ec8a1dcc7c906d41`.

## What 0.4.0 guarantees

### Runtime ownership and Strict Mode

The 0.4.0 guide says to build one application runtime in `bootstrap()` before
`createRoot`, keep the runtime owner outside components, and give each application,
session, or project lifetime one runtime. React receives narrow services through
Context, never a bag. Project selection occurs in an Effect, never during render
or `useMemo`. [0.4.0 React guide: ownership and bootstrap](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#who-owns-what),
[0.4.0 React guide: connect to React](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#connect-it-to-react)

This matches React's contract: Strict Mode calls component bodies and functions
passed to `useState`/`useMemo` twice in development, and performs an extra Effect
setup/cleanup cycle. Resource construction in render or a lazy initializer can
therefore acquire abandoned ownership; an Effect-owned selection must tolerate
setup → cleanup → setup. [React StrictMode](https://react.dev/reference/react/StrictMode#fixing-bugs-found-by-double-rendering-in-development),
[React StrictMode Effects](https://react.dev/reference/react/StrictMode#fixing-bugs-found-by-re-running-effects-in-development)

The tagged owner handles that sequence by making stale `release()` calls no-ops
and deferring startup by a microtask; its tagged test expects generation 1 to be
released before startup and generation 2 to become live. This is a tested recipe,
not exported DI Bag API: the guide says the roughly 200-line owner is copied by
the application. [Tagged owner](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/examples/react/runtime-owner.ts#L34-L38),
[tagged Strict Mode test](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/tests/react/runtime-owner.test.ts#L89-L104),
[guide packaging statement](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#when-this-becomes-a-package)

### Replacement is an application policy

DI Bag's exported builder `replace()` changes a graph registration before a bag
is built, and `fork()` creates an independent ownership family. Neither is a live
React runtime handoff. Live identity replacement in the React guide belongs to
the copyable `RuntimeOwner`. [0.4.0 API declarations](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/src/di-bag.ts),
[tagged owner](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/examples/react/runtime-owner.ts#L52-L58)

The tagged owner withdraws/retires the current slot, serializes the next startup
behind the prior slot's settlement, fences stale startup completion, and never
publishes a replaced startup. Those mechanics support Puni's current-owner and
withdraw-before-close requirements. [0.4.0 guide guarantees](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#the-runtime-owner)

Its success criterion differs from Puni's. `settle()` reports a close rejection
and resolves the slot, so the queued replacement starts after cleanup _settles_,
even if it failed. The tagged test explicitly requires a rejecting disposer to
reach the sink while replacement `b` still becomes ready.
[Tagged implementation](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/examples/react/runtime-owner.ts#L123-L180),
[tagged failure test](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/tests/react/runtime-owner.test.ts#L197-L210)

When `closeTimeoutMs` is configured, the owner races its own deadline against the
unbounded close, reports `close-wait-expired`, then starts the replacement while
the old teardown continues. A later teardown rejection is still reported. The
guide calls this an intentional overlap policy and says omitting the deadline
prevents overlap. [0.4.0 guide timeout policy](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#the-runtime-owner),
[tagged timeout test](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/tests/react/runtime-owner.test.ts#L231-L255)

**Application consequence:** Puni must retain the useful generation, stale-release,
withdrawal, and serialized-retirement mechanics, but change the transition gate.
A cleanup rejection or bounded-wait expiry reports once, leaves the requested
identity unpublished in a failed/unavailable state, and does not launch its
replacement. This is Puni's existing R5 constraint, not a DI Bag claim or a
remaining user preference.

### Close deadlines and continued cleanup

`Bag.close()` disposes owned resources once, dependents before dependencies.
Repeated unbounded calls return the same shutdown promise. `timeoutMs` and
`signal` bound only the caller's wait; they do not cancel cleanup. A bounded wait
rejects with `DiBagCloseCancelledError`, whose `details.pending` and
`details.acquiring` identify unfinished work and whose `cleanupPromise` is the
shared eventual shutdown. Cleanup failures are aggregated only after every
disposer is attempted. [0.4.0 `Bag.close`](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/src/di-bag.ts#L305-L323),
[0.4.0 close options](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/src/startup.ts#L22-L30),
[0.4.0 close error](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/src/errors.ts#L183-L224)

This makes Puni's fail-closed policy implementable without pretending a timeout
stopped work: retain and observe `cleanupPromise` after reporting the transition
failure, but keep replacement refused. The package does not decide whether or
when an application may retry after eventual cleanup; Puni's transition API and
tests must state that behavior. This last sentence is a gap/inference, not an
upstream contract.

## `pagehide`, BFCache, and reconstruction

The tagged example registers a once-only `pagehide` listener that calls
`void shutdown()`. `shutdown()` is shared, unmounts React, awaits the project
owner, then closes the application runtime. The guide correctly labels this
best effort and says the browser does not await it; correctness for exclusive
remote/shared resources needs leases, heartbeats, or takeover behavior.
[Tagged bootstrap](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/examples/react/bootstrap.tsx#L28-L48),
[0.4.0 navigation guidance](https://github.com/dany-fedorov/di-bag/blob/v0.4.0/docs/guides/react-integration.md#development-hmr-and-navigation)

Platform guidance adds three limits:

- `pagehide` is BFCache-compatible but is not reliable in every termination
  scenario, especially on mobile. It can initiate cleanup, not prove completion.
  [MDN `pagehide` usage notes](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event#usage_notes)
- `pagehide.persisted === true` means the browser might reuse the page; it does
  not guarantee caching. `pageshow.persisted === true` identifies an actual
  restored page. [HTML `PageTransitionEvent.persisted`](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-pagetransitionevent-persisted),
  [web.dev BFCache events](https://web.dev/articles/bfcache#observe_when_a_page_is_restored_from_bfcache)
- A BFCache page pauses pending timers, promises, and almost all pending tasks.
  First-party browser guidance recommends closing shared connections during
  `pagehide`/`freeze` and reopening them on `pageshow`/`resume` while preventing
  duplicate connections. [web.dev BFCache task suspension](https://web.dev/articles/bfcache#how_the_cache_works),
  [web.dev connection lifecycle](https://web.dev/articles/bfcache#close_open_connections_before_the_user_navigates_away)

**Measured gap in the 0.4.0 recipe:** after its `pagehide` handler unmounts and
closes everything, the tagged example has no `pageshow` handler to rebuild on a
BFCache restore. Its `{ once: true }` listener is also gone after that first
`pagehide`. Therefore the recipe does not satisfy Puni's accepted persisted-hide
retirement contract by itself. Re-running the whole bootstrap on persisted
`pageshow`—application runtime, React root, listeners, session restoration, and
project selection—is a Puni requirement consistent with platform guidance, not
an API supplied by DI Bag.

## Durable implementation requirements

1. Treat the tagged React material as a tested reference recipe that is absent
   from the npm tarball. Keep Puni's runtime owner in application source; do not
   import or describe the tagged owner as exported package API.
2. Construct the application runtime before `createRoot`, outside the Strict Mode
   subtree. Select project/session identities from Effects through a host owner;
   never acquire a runtime in render, `useMemo`, or a lazy state initializer.
3. Preserve generation fencing, stale-release no-ops, withdrawal before retirement,
   and project-before-session-before-application ordering. Builder `replace()` and
   `fork()` are graph/test composition operations, not live ownership handoff.
4. Gate replacement on successful required retirement. A cleanup failure or
   bounded-wait expiry reports once, leaves the requested lifetime unavailable,
   and starts no replacement. Do not copy the upstream owner's `settle()` behavior,
   which deliberately continues after those outcomes.
5. On a bounded close rejection, retain and observe
   `DiBagCloseCancelledError.cleanupPromise`. The transition stays failed while
   eventual cleanup completion or rejection remains accounted for; timeout never
   means cancellation.
6. Treat `pagehide` shutdown as best-effort initiation. On persisted `pageshow`,
   join the shared pagehide retirement before rebuilding. Rebuild the complete
   application graph, React root, listeners, identity, and project only after
   retirement succeeds. If retirement rejects or exceeds its bounded wait,
   retain observation of continuing cleanup, publish the sanitized fatal state,
   and do not bootstrap automatically. Eventual cleanup completion does not
   silently resume the refused rebuild. Never reuse contexts pointing to retired
   services.
7. Add production-path negatives for both prohibited upstream continuations:
   inject a required disposer failure and a deferred disposer that exceeds the
   close deadline; in each case assert no replacement startup occurs. Break the
   transition gate and observe that startup occurs. The timeout proof must also
   show that late cleanup remains observed.

## Evidence limits

No package code, repository code, dependency, or personal checkout was changed.
No tests, browser lane, or heavy checks were run. The tagged guide's test claims
were inspected in source but not rerun. Network retrieval was limited to official
DI Bag `v0.4.0`, React, WHATWG/MDN, and Chrome/web.dev sources. The proposed local
owner shape is a feasibility inference from the public error contracts plus Puni's
R5 policy; exact retry UX and runtime identifiers remain outside this research.
