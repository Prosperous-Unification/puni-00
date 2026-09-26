## ADDED Requirements

### Requirement: Verified identity chooses an onboarding path

After sign-in, a user without membership SHALL establish a verified email before creating an organization, accepting an invitation or requesting to join. If its exact domain belongs to a verified organization, WBS SHALL show that organization and offer a join request or invitation acceptance; organization creation through that address MUST be refused. Otherwise the user SHALL be able to create an organization and become its first super-admin atomically. Creation SHALL NOT claim the email domain. Existing members SHALL be able to select an active membership. A verified email on a public domain SHALL remain eligible to create an organization.

#### Scenario: Matching company domain

- **GIVEN** `example.org` is verified for organization A and a new user has a verified `@example.org` address
- **WHEN** they finish sign-in
- **THEN** onboarding names A and offers a join request, with no project access or organization-creation path

#### Scenario: Unverified email

- **GIVEN** an identity whose email is missing or unverified
- **WHEN** the user enters onboarding
- **THEN** organization creation, invitation acceptance and join request are refused until email verification is established

#### Scenario: First owner

- **GIVEN** a verified user whose domain has no verified owner
- **WHEN** they create an organization
- **THEN** the organization and their super-admin membership commit together

### Requirement: Invitations are bound and single use

An authorized administrator SHALL create a revocable invitation for one normalized verified recipient email, organization and permitted role with an expiry. Only the matching currently verified email SHALL accept it. Acceptance SHALL consume the invitation and create or retain one membership atomically; expiry, revocation, concurrent acceptance and replay MUST be refused. Admins SHALL only invite viewer or member; super-admins SHALL also invite admin. An invitation SHALL NOT directly grant super-admin.

#### Scenario: Invitation replay

- **GIVEN** an invitation has been accepted once
- **WHEN** the recipient or another caller submits it again
- **THEN** acceptance is refused and no additional membership is created

#### Scenario: Address and expiry binding

- **GIVEN** an invitation addressed to `a@example.org`
- **WHEN** a user verified as `b@example.org` accepts it, or the invitation has expired
- **THEN** acceptance is refused without consuming a valid invitation for `a@example.org`

### Requirement: Join requests require administrator approval

A verified-email user SHALL be able to submit at most one pending request to a matching verified organization. A current admin or super-admin SHALL approve it as viewer or member, or deny it, using the requester's current verified email and organization state. Approval SHALL issue one addressed invitation atomically; request submission, approval and denial SHALL grant no membership until the recipient accepts that invitation. Admin membership and super-admin grants SHALL require the super-admin invitation or role-change path.

#### Scenario: Approval after domain loss

- **GIVEN** a pending request made while the user's domain matched an organization
- **WHEN** the domain is no longer verified and an admin tries to approve it
- **THEN** approval is refused and no invitation or membership is created

#### Scenario: Concurrent approval

- **GIVEN** one pending join request
- **WHEN** two admins approve it concurrently
- **THEN** exactly one invitation is issued, no membership is created, and the second approval is refused as already resolved

### Requirement: Organization administration has explicit rendered states

fe-01 SHALL provide onboarding, organization switching, a members page for invites, roles, removal and pending requests, and domain settings. Loading, no memberships, empty lists, expired invite, query failure and lost permissions SHALL render distinct states. A stale tab SHALL not retain foreign organization data after switch or membership removal.

#### Scenario: Membership removed in another session

- **GIVEN** a member has a members page open
- **WHEN** that membership is removed and the page refreshes or receives a refusal
- **THEN** it clears organization data and renders the no-access state
