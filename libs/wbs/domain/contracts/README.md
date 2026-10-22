# contracts

The shapes two tiers have to agree about, and the one place each is written.
`runtime:isomorphic`: be-01 and gw-01 parse with it, fe-01 builds with it.

## Files

- **`ws.ts`** — the realtime vocabulary as **parsers**: `WsFrame` (a
  subscription's payload) and `WsControlFrame` (the nine control arms). What an
  inbound frame is judged against.
- **`ws-frames.ts`** — the same vocabulary as **builders**, which serialise. It
  imports nothing, so fe-01 takes it as `@wbs/contracts/ws-frames` without
  pulling arktype into the browser bundle.
- **`internal.ts`** — the be-01 ↔ gw-01 forward and push envelopes.
- **`errors.ts`** — the refusal codes both tiers name.
- **`http/`** — every HTTP endpoint as an `EndpointShape` (method, path,
  operation id, request policies, params, query, body and reply schemas), grouped
  per resource in `*-shapes.ts` and catalogued as `httpShapes` in `shapes.ts`;
  the typed client (`client.ts`, `client-fetch.ts`, `client-types.ts`,
  `client-error.ts`); modeled HTTP refusals (`refusal.ts`); and `schema-shape.ts`,
  the one wire declaration OpenAPI and MCP emission read.
- **`commands/definitions.ts`** — `commandDefinitions`, the plan and directory
  command catalogue the command batch parses against.
- **`runtime-request.ts`** — the public runtime payload identity codec and strict request parsers.
- **`plan-command-values.ts`** — the shared command batch bound.
- **`auth-methods.ts`** — the sign-in methods WBS offers as direct buttons.
- **`oidc-identity.ts`** — the identity read from a verified upstream OIDC
  credential, and the WBS scopes.
- **`principal.ts`** — who a request is once a session token is believed; it
  lives here because the command batch, replay, save and retention sweep admit
  on it without being about authentication.
- **`logger.ts`** — the logging surface application code and runtime adapters
  share.

## Refusals

A frame that does not parse is a **modeled** refusal, never a throw at the
socket: gw-01 answers `{ type: 'error', code: 'invalid_payload' }` and keeps the
connection. A control arm this build does not know reaches the client's
`onControl` untouched rather than failing the read — a gateway and a browser are
deployed separately and one of them is always newer.

## Landmines

- **A builder and its parser must round-trip.** They did not, twice: gw-01 sent
  `resume_denied` with `reason: 'unavailable'` against a parser that declared
  only `'out_of_range'`, and an `error` naming a `subscription` the parser had no
  field for. Neither showed as a failure, because fe-01 reads `type` and ignores
  the rest. `the frames a builder writes` is the assertion that closed it.
- **Field order is the builders'**, because a caller comparing sent strings
  compares them byte for byte.

## Test

```sh
bunx nx run wbs-contracts:test # the round trip is `the frames a builder writes` in ws.test.ts
```
