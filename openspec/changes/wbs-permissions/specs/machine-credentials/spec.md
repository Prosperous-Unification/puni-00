## MODIFIED Requirements

### Requirement: A machine token acts as its pinned person's account with capped scopes

A request admitted by a machine credential SHALL act as the account the pinned person is
bound to, with scopes exactly `read` and `write`, bound to the credential's organization,
and with the credential's person as the pin the claim decision reads. In that organization
its effective role at every grant scope SHALL be capped at contributor
(`wbs-permissions`, machine cap), whatever grants reach the bound account and through
whichever subject, so no manager, admin or super-admin permission (the claim-admin bypass,
person binding, settings, grants) applies to it. Organization administration routes SHALL
refuse it `403 insufficient_scope` as before, and a grant or group write SHALL refuse it
`403 forbidden` naming the grant permission. A claim or release naming another person,
outside a delegated claim under the pinned person's claim, SHALL be refused
`credential_not_for_person` as today. An account no longer a member of the credential's
organization SHALL be refused `403 not_a_member` with the credential unchanged. Enforced
SSO and the session policy SHALL NOT refuse a machine token.

#### Scenario: A manager's account, a contributor's reach

- **WHEN** a credential's person is bound to an account holding `(organization A,
org-super-admin)`
- **THEN** a `createWorkItem` batch on a package of A is accepted, `freezeWorkPackage` on the
  same package is refused `403 forbidden` naming `package.manage_settings`, and
  `GET /api/organization/members` is refused `403 insufficient_scope`

#### Scenario: A manager's account gives a machine no manager rule

- **WHEN** a key pinned to `claire`, bound to an account holding `org-super-admin` in A,
  sends `patchPerson` binding another person to an account, or claims as a person bound to
  another account
- **THEN** the patch is refused `403 forbidden` naming `organization.manage_directory`,
  the claim `person_not_bound`, and nothing is written

#### Scenario: A claim for the wrong person

- **WHEN** a machine token pinned to `claire` claims a step as `claude-code` outside any
  subtree claim of `claire`
- **THEN** the batch is refused `credential_not_for_person` and writes nothing

#### Scenario: A delegated claim keeps working

- **WHEN** `claire` holds a subtree claim and a token pinned to `claire-worker`, bound to
  the same account, claims a leaf under it naming that claim as parent
- **THEN** the claim is accepted exactly as before

#### Scenario: Enforced SSO does not refuse a machine

- **WHEN** A enforces SSO and a request bears A's live API key
- **THEN** the request is admitted
