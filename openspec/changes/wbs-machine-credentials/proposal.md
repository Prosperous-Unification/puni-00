## Why

A fleet writes to WBS today only after a host operator runs
`link-credential-cli.ts` in the live be-01 container, linking an Auth0
machine-to-machine pair to a human's account. No member or admin can create,
see, rotate or revoke a machine credential, the MCP consent page authorizes
only the signed-in human, the one secret source is PUNI's own Auth0 tenant,
which no customer would use, and after activation a raw Bearer binds no
organization (`no_active_organization`). We use the offering we build: our
fleets onboard self-serve as the first tenant.

## What Changes

**Who admits a machine**

- From: a host operator, by CLI, per deployment.
- To: a member for agent persons bound to their own account, an admin for every
  agent person, in organization settings and on the people page.

**What a credential is**

- From: an `external_identity` row pinned to a person.
- To: a `machine_credential` row of one organization, pinned to one agent
  person, recording its issuing account, with a source: a WBS-issued API key, an
  OIDC token from a trusted issuer or proven OIDC connection, or an MCP consent
  in which the human authorized an agent person instead of themself.

**What a token may do**

- From: everything the linked human account may do.
- To: read and write as the pinned person's account in the credential's
  organization; never administration, never the issuer's rights.

**Lifecycle**

- From: link and unlink.
- To: create, list with last use, rotate with bounded overlap, revoke; each act
  one `organization_audit` row: "<person> acted, issued by <account>".

Impact: the operator CLI is retired, nothing is migrated; PUNI's fleets are
re-admitted self-serve.

## Non-Goals

- Quotas; PUNI-hosted compute providers (Twilight Dash); billing; SCIM
  provisioning of agent persons; production activation.
- How humans log in: Auth0 connections per organization are unchanged.
- The fleet-wide credential epoch (organization-ownership task 6.5) stays the
  kill switch, untouched.
- Auth0 machine-to-machine applications as a source; MCP `client_credentials`;
  changes to persons, claims or delegated claims; SAML as an OIDC source.

## Constraints

- Additive migrations with guarded `down.sql` in be-01 and mcp-01; blue and
  green share one SQLite file; audit vocabulary widens by compatible rebuild.
- One verification path for every source; secrets stored only as digests and
  shown once; be-01 holds no refresh token.
- Every refusal ships with a production-path negative and a `Proof:` comment.
- UI on `@ui/core-01`/`@ui/saas-01` (ADR 0056); behaviour and states only.

## Capabilities

### New Capabilities

- `machine-credentials`: organization-owned credentials, their three sources,
  verification, lifecycle, audit, consent minting and the settings surfaces.

### Modified Capabilities

- `fleet-credentials` (`wbs-team-claims`): the CLI link requirement is removed;
  machine-token scoping comes from the credential.
- `organization-audit` (`organization-enterprise-sso`): credential and trusted
  issuer acts join the vocabulary.

## Domain Terms

Machine credential, Credential source, Consent credential, Trusted issuer,
Rotation window (in `CONTEXT.md`); Fleet credential becomes an avoided name.

## Decisions Recorded

No ADR. Owner decisions A1 to A8, A21 and A22 are fixed; A9 to A20 are this
draft's assumptions, each overrulable by id (A14 superseded by A22, A19
withdrawn by A21). All are in design.md, "Decisions".

## Impact

`@wbs/contracts`, `@wbs/core`, `@wbs/store-sqlite`, `@wbs/auth`, be-01
(verification, routes, internal MCP routes, migration, CLI retirement), mcp-01
(consent page, store migration, delegation requests), fe-01 (settings panel,
people page), `docs/auth-integration.md`, `docs/runbook-prod-deploy.md`.
