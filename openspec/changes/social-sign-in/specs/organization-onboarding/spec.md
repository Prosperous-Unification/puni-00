## ADDED Requirements

### Requirement: An OIDC identity with an unverified email is told where to verify it

When onboarding reports `verification_required` for a session established through an identity
provider, the screen SHALL tell the person to verify the address with their sign-in provider and
sign in again, because each mapped login refreshes the verified-email flag; a password session MUST
keep the email challenge.

#### Scenario: GitHub identity with an unverified primary email

- **WHEN** a session from `github|3` without `email_verified` opens onboarding
- **THEN** the verification step says "Verify this address with your sign-in provider and sign in again"

#### Scenario: the next verified login proceeds

- **WHEN** the same subject signs in again with `email_verified: true`
- **THEN** the mapped user's email is verified and onboarding offers its next step
