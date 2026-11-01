## Why

Dev users can reach the sign-in page with browser credentials the server cannot verify. Password sign-in then asks them to reload, which preserves those cookies, while the SSO callback returns an empty 401 page. Both paths leave users unable to start a fresh session without manually clearing site data.

## What Changes

Approved explicit recovery behavior:

- Offer an explicit **Reset browser session** action when password sign-in rejects the prior browser credential or a state-bound SSO callback encounters the same refusal.
- Clear only this browser's WBS access, correlation and organization-selection cookies through an exact-origin POST, then let the user retry sign-in.
- Return a valid, browser-bound SSO callback to the sign-in page with a fixed recovery message instead of an empty 401 for this specific refusal.
- Keep successful logout, credential replacement and authentication as separate operations with their existing proofs.

## Non-Goals

Provider configuration changes, persistent refresh secrets, automatic sign-in retries, account changes, global session revocation, and changes to CLI dependencies.

## Constraints

Reject unverified predecessors before password verification, provider exchange or account creation. Cookie reset cannot issue credentials, acknowledge durable logout, infer an account from unverified claims, revoke arbitrary server state, or turn storage failures into recoverable authentication refusals. Require exact Origin for cookie reset; reject non-browser authorization carriers. Callback recovery requires a consumed transaction matching both state and browser binding. No migration is needed.

## Capabilities

### New Capabilities

- `browser-sign-in-recovery`: explicit local cookie reset and useful sign-in recovery after a refused browser predecessor.

### Modified Capabilities

None. Existing replacement and logout admission remain required; this adds a separate local reset operation.

## Domain Terms

None. Existing browser lifecycle session and credential revocation retain their definitions.

## Decisions Recorded

None.

## Impact

WBS shared HTTP contracts, be-01 auth endpoint bindings, fe-01 sign-in card, production-path auth tests and auth integration documentation. Dev receives runtime changes only after merge to main.
