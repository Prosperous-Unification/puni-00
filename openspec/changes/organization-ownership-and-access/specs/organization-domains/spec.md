## ADDED Requirements

### Requirement: WBS verifies exact domain control

Only a current super-admin SHALL start a domain claim. WBS SHALL canonicalize an exact DNS domain, reject public suffixes, relay domains and maintained public-email domains, and issue a cryptographically random, organization-and-domain-bound TXT token valid for 24 hours. The challenge SHALL be shown with its required DNS name and value. A verification attempt SHALL query authoritative DNS with a bounded timeout and accept only the current unexpired token. Reissuing a challenge SHALL invalidate prior tokens. A domain SHALL have at most one verified organization owner, decided atomically at verification; pending challenges SHALL not reserve ownership indefinitely. Failed DNS lookup SHALL not silently verify or claim it.

#### Scenario: Public domain refusal

- **GIVEN** `gmail.com` is on the maintained public-domain list
- **WHEN** a super-admin requests its claim with valid DNS control evidence
- **THEN** WBS refuses the claim before issuing a verification token

#### Scenario: Concurrent domain claim

- **GIVEN** two organizations have pending challenges for the same domain
- **WHEN** both present valid TXT records and verify concurrently
- **THEN** exactly one organization becomes verified owner and the other receives a conflict

#### Scenario: Old token after rotation

- **GIVEN** a domain challenge was rotated
- **WHEN** DNS contains only the previous token
- **THEN** verification is refused and the domain remains unverified

### Requirement: Verification has a loss and transfer lifecycle

WBS SHALL recheck verified domains every seven days and record the last successful proof. A failed check SHALL suspend domain-based onboarding after a 14-day grace period since the last successful proof; a successful check within that period SHALL restore verification. DNS errors SHALL retain the last known ownership during grace and surface an administrator warning. A suspended domain SHALL not route new users or approve new domain-based join requests, but SHALL not delete existing memberships or transfer content. A current super-admin SHALL be able to release a domain; another organization SHALL claim it only through a new DNS challenge after release. Missing or unreadable maintained public-domain policy SHALL stop claim and verification operations.

#### Scenario: Domain proof disappears

- **GIVEN** a verified domain has no successful TXT proof for more than 14 days
- **WHEN** scheduled re-verification runs
- **THEN** the domain is suspended, signup no longer routes to it, and existing members retain their memberships

#### Scenario: Transfer requires fresh proof

- **GIVEN** A releases its verified domain
- **WHEN** B requests ownership without a fresh B-bound TXT proof
- **THEN** B remains unverified
