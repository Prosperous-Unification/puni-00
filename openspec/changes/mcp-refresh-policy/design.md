## Current behavior

`InMemoryMcpOAuth.refreshGrant`, `callerSessionFor` and `refreshSession` converge on `refreshUpstreamIfNeeded`. Its fresh-token and recently-refreshed returns precede any organization check. `McpSessionStore` already persists family organization/user/issuer and epoch, alongside subject/client/scope, and copies binding and epoch into sessions. Production issues unbound epoch-0 families. Startup rejects a durable epoch other than `SUPPORTED_CREDENTIAL_EPOCH=0`.

The existing `credentialRuleRefusal` checks enforced connection prefixes and session bounds. Delegated upstream credentials currently have no trusted lifecycle times and are refused whenever a session policy applies. A refresh must not invent those facts to obtain admission.

## Authoritative binding

Consent resolves organization and stable user through trusted WBS authority and verified issuer/subject. The authorization context, consumed code, grant, durable family and issued session carry the same organization/user/issuer/subject/client/epoch; granted scopes can only narrow. The refresh secret identifies its family, never an organization supplied by a client. Signed delegation preserves the same identity and scope on initial use and every retry. Session and family binding agreement must be validated before use, rather than merely trusting copied columns.

Authentication evidence is a distinct immutable lifecycle association: `openedAt` and `reauthenticatedAt` are separately trusted milliseconds or explicitly unknown. Provider refresh completion, access-token `iat`, current time and consent rendering time cannot replace either fact. Actual successful reauthentication can advance only its corresponding trusted fact; token rotation cannot reset maximum session age. Issuance/transport of these facts belongs to the later binding slice.

## Inert authority boundary (implemented first)

Classify a durable family as legacy only when it has no binding and epoch equals 0. A bound family requires organization authority; an unbound nonzero or unknown epoch is unsupported. Both refuse before the shared fresh-token return and before provider contact. The initial release installs no authoritative organization reader, issues no bound family and advances no epoch. Refusal is the existing session-refusal outcome for callers and `invalid_grant` at the token endpoint; it does not consume the refresh secret or create successor credentials. Durable test compositions attach the existing binding fields at family creation and traverse all three real OAuth paths.

This slice provides no policy reader, policy admission, authentication-time transport or organization-aware issuance. Its guard cannot be interpreted as completion of refresh policy.

## Subsequent policy composition

Install a typed authoritative reader keyed by immutable family authority, with explicit admitted, denied and unavailable outcomes. It rechecks current membership, verified issuer-subject-to-user binding, enforced proven connections, session policy and lifecycle evidence in one consistent read. Missing/malformed trusted state throws; a modeled service outage is unavailable, never admission or policy denial. Evaluate shared `credentialRuleRefusal` semantics, extending its typed trusted lifecycle input for upstream delegations only when genuine independently verified facts exist. Preserve equality admission at both bounds and refusal one millisecond beyond; unknown times refuse when the corresponding bound applies.

Every entry checks policy even with a fresh provider token. A provider wait or rival lease completion requires another authoritative read before returning credentials, persisting provider replacements, signing a successor or dispatching a tool. Compare immutable authority and current policy revision; a changed read retries within a bounded convergence loop then refuses/unavailable, never publishes stale authority. Membership loss or tightening during a held provider operation must prevent successor sessions, refresh tokens, delegation and tool dispatch. Release leases on controlled refusal; handle a provider-rotated secret without exposing it or restoring authority.

## Controlled policy and provider composition (implemented follow-up)

The optional constructor port `McpRefreshAuthorityReader` is absent from `mcpOAuthFromEnv`. Only controlled compositions attach it to durable bound test families. An admitted read echoes the immutable family/client/subject/scope/epoch/org/user/issuer identity it verified and supplies current membership admission, enforced connections, policy and independently trusted lifecycle facts. Denial is a non-consuming direct authority refusal; a modeled outage maps to unavailable; unexpected reader failures propagate. Shared `credentialRuleRefusal` accepts explicit `delegationLifecycle` for this trusted boundary. Existing be-01 callers provide no such evidence and retain their prior delegation refusal under policy.

Automatic, forced and token-endpoint refresh evaluate the reader before a fresh token can escape. The lease owner repeats evaluation before provider work and after provider completion, before persisting its access replacement. Because the authority read can outlive its lease, the owner synchronously rechecks durable ownership, version and expiry after that await. A stale owner releases only its own lease and rejoins the existing bounded convergence loop before provider dispatch. A refused completion releases its lease and retains an already rotated provider secret for retry without returning or persisting the refused access replacement. A rival waiter rechecks before returning the winner's replacement. Family identity is compared both with the originally supplied identity and with current durable reads after the authority wait. Future credential epochs remain unsupported even with an injected reader.

This follow-up does not install a real organization reader, carry lifecycle evidence through consent/code/grant/session issuance, validate copied session binding, sign organization delegation, or settle mounted forced-refresh family lifecycle. It proves direct OAuth behavior under trusted controlled composition. The reader has no policy revision; bounded revision convergence and an authority fence across asynchronous signing/consumption remain task 3.1c. Neither this slice nor its tests establish safe organization-aware production activation.

## Replay, scope and final use

Judge refresh reuse before capacity/policy short circuits so replay still revokes its family. Refuse scope widening before provider work, and keep requested narrowing in successor credentials. Commit successor credentials only after authoritative checks and the existing consuming transaction succeeds; a racing replay/revocation cannot leave a usable successor. Single provider refresh lease behavior remains intact. be-01 repeats current organization and credential-rule authorization on actual use, including forced refresh retry, to close changes after MCP's final read.

## Mounted forced-refresh activation prerequisite

The current `server.ts` tool caller interprets any `SessionRefreshRefused` after an upstream rejection as terminal and calls `endSession`, revoking the family. The inert bound-family guard runs earlier during request authentication, so bound families cannot currently reach that mounted forced-refresh branch. Direct `refreshSession` preservation tests therefore do not prove mounted family preservation after activation. Before enabling bound requests, task 3.3 must give terminal and nonterminal authority refusals explicit caller semantics and prove the chosen family lifecycle through the mounted endpoint; unavailable outcomes remain distinct.

## Verification boundary

The first slice proves durable bound-family refusal and fresh-token bypass prevention on the three real refresh paths. Follow-up tests must cover identity substitutions across every binding stage, session/family disagreement, scope widening, unsupported epoch, unknown/boundary times, dropped membership, provider-held policy tightening, replay and races, and absence of successor credentials or tool calls. Remove each production guard in turn, observe its named negative fail and record the fault beside the restored guard.
