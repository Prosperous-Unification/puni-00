## Why

MCP refresh currently relies on family expiry and provider availability without checking current organization membership, enforced SSO or session policy. A fresh provider token also bypasses those checks. This is an unimplemented prerequisite for WBS 010.5.7 and organization credential cutover.

## What Changes

Specify one authoritative family binding and current policy evaluation at token refresh, automatic caller resolution and forced refresh. Check before provider contact and after held provider work. Preserve unknown authentication times and existing credential-rule semantics. First deliver an inert boundary that distinguishes unbound epoch-0 families and refuses bound or unsupported families without an installed authority reader, including when the provider token is fresh.

## Non-Goals

No production organization-bound issuance, credential-epoch advance, activation, migration, deployment or provider configuration. This change does not complete organization-ownership-and-access tasks 6.4–6.6 or enterprise SSO cutover.

## Constraints

Production remains epoch 0 with `SUPPORTED_CREDENTIAL_EPOCH=0`. Organization identity never comes from tool arguments or a client-selected organization. Reuse revocation, scope narrowing, rotation and lease concurrency retain their contracts. Policy denial and authority/provider outage stay distinct. be-01 independently retains final refusal authority.

## Capabilities

### New Capabilities

- `mcp-refresh-policy`: authoritative organization refresh eligibility across every refresh entry path.

### Modified Capabilities

None.

## Domain Terms

MCP family authority; MCP authentication times.

## Decisions Recorded

None.

## Impact

mcp-01 OAuth and durable family authority; later slices require a be-01 current-authority reader and shared credential rules. Correct the stale enterprise-SSO design claim that MCP refresh already checks policy.
