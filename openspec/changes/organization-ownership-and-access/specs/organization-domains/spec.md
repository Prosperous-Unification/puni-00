## ADDED Requirements

### Requirement: WBS verifies exact domain control

Only a current super-admin SHALL start a domain claim. WBS SHALL canonicalize an exact DNS domain, reject public suffixes, relay domains and maintained public-email domains, and issue a cryptographically random, organization-and-domain-bound TXT token valid for 24 hours. The challenge SHALL be shown with its required DNS name and value. A verification attempt SHALL query authoritative DNS with a bounded timeout and accept only the current unexpired token. Reissuing a challenge SHALL invalidate prior tokens. A domain SHALL have at most one verified organization owner, decided atomically at verification; pending challenges SHALL not reserve ownership indefinitely. Failed DNS lookup SHALL not silently verify or claim it.

The active organization's domain list SHALL be visible only to a current super-admin and SHALL omit challenge secrets. Before activation, both list and issuance SHALL refuse. The public-domain policy SHALL be a revisioned, checksum-checked, licensed asset read on each claim decision; the public suffix rule SHALL include ICANN and private suffixes from the pinned PSL package. Missing, unreadable, malformed or checksum-invalid policy SHALL throw rather than admit a claim. A reissued pending challenge SHALL replace the old digest in the same organization's row under an immediate transaction that rechecks current super-admin membership.

#### Scenario: Pre-activation and lost-authority refusal

- **GIVEN** organization isolation is inactive, or a request's super-admin membership was removed or demoted
- **WHEN** the caller lists domains or requests a challenge
- **THEN** WBS refuses with typed 403 and stores no new challenge

#### Scenario: Broken maintained policy

- **GIVEN** the policy asset or manifest is absent, unreadable, malformed or fails its pinned checksum
- **WHEN** a current super-admin requests a challenge
- **THEN** the operation throws a server fault and stores no claim

#### Scenario: Public domain refusal

- **GIVEN** `gmail.com` is on the maintained public-domain list
- **WHEN** a super-admin requests its claim with valid DNS control evidence
- **THEN** WBS refuses the claim before issuing a verification token

#### Scenario: Concurrent domain claim

- **GIVEN** two organizations have pending challenges for the same domain
- **WHEN** both present valid TXT records and verify concurrently
- **THEN** exactly one organization becomes verified owner and the other receives a conflict

#### Scenario: Initial verification endpoint refusals

- **GIVEN** a signed-in super-admin with an active organization and a pending domain claim
- **WHEN** they POST `/api/organization/domains/:id/verify`
- **THEN** an exact current TXT record promotes the digest to retained proof in one immediate transaction
- **AND** a missing or foreign claim answers identical `404 not_found`; a stale or changed challenge, mismatched proof or another verified owner answers typed 409; unavailable, timed-out or malformed authoritative DNS answers `503 dns_unavailable` without promoting
- **AND** current super-admin authority, activation, challenge expiry and maintained policy are rechecked before the write

#### Scenario: Production DNS requires two agreeing public resolvers

- **GIVEN** be-01 runs with `WBS_DOMAIN_DNS=doh`
- **WHEN** a verification or retained check looks up `_wbs-verification.<domain>`
- **THEN** WBS queries the DNS-over-HTTPS JSON endpoints at 1.1.1.1 and 8.8.8.8 and trusts the TXT records only when both answer and their record multisets are equal; NXDOMAIN at both is an agreed empty answer
- **AND** a failed, truncated, non-NOERROR or malformed answer from either, or any disagreement, is a typed refusal that answers `503 dns_unavailable` or records a failed check, never a pass
- **AND** without `WBS_DOMAIN_DNS=doh` lookups keep refusing, and the periodic worker starts only with `WBS_DOMAIN_PROOF_WORKER=on`, which configuration refuses unless `WBS_DOMAIN_DNS=doh`

#### Scenario: Old token after rotation

- **GIVEN** a domain challenge was rotated
- **WHEN** DNS contains only the previous token
- **THEN** verification is refused and the domain remains unverified

### Requirement: Verification has a loss and transfer lifecycle

On successful initial verification, WBS SHALL promote the verified challenge digest to a retained organization-and-domain-bound ownership proof distinct from the 24-hour initial challenge expiry. That proof SHALL remain eligible for seven-day checks after the initial challenge expires; a super-admin MAY rotate it, with the previous proof accepted only until the new proof succeeds or a 24-hour rotation window ends; successful rotation SHALL replace the retained proof. WBS SHALL recheck verified domains every seven days against the retained current proof and record the last successful proof. A failed check SHALL suspend domain-based onboarding after a 14-day grace period since the last successful proof; a successful check within that period SHALL retain verified status. A successful check against the retained or freshly rotated proof after suspension SHALL restore verified status and domain-based onboarding without changing ownership. DNS errors SHALL retain the last known ownership during grace and surface an administrator warning. A suspended domain SHALL retain its unique organization ownership claim and SHALL not route new users or approve new domain-based join requests, but SHALL not delete existing memberships or transfer content. A current super-admin SHALL be able to release a domain; another organization SHALL claim it only through a new DNS challenge after release. Missing or unreadable maintained public-domain policy SHALL stop claim and verification operations.

#### Scenario: Initial challenge expires before periodic check

- **GIVEN** A verified a domain on day 0 and the 24-hour initial challenge expired
- **WHEN** the day-7 check finds the retained current TXT ownership proof
- **THEN** verification succeeds and the domain stays verified

#### Scenario: Retained check warning

- **GIVEN** a verified domain is due seven days after its last check
- **WHEN** authoritative DNS times out or lacks the exact retained proof
- **THEN** WBS records the check time without advancing the success time, keeps ownership and verified status during this slice, and domain GET shows a proof warning without revealing the digest
- **AND** an exact successful check advances both timestamps and clears the warning, even after the initial challenge expiry
- **AND** a release or proof change during lookup prevents the old result from updating the claim

#### Scenario: Domain proof disappears

- **GIVEN** a verified domain has no successful TXT proof for 14 days
- **WHEN** scheduled re-verification runs
- **THEN** the domain is suspended, signup no longer routes to it, A retains the unique ownership claim, and existing members retain their memberships

#### Scenario: Proof rotation overlap

- **GIVEN** a current super-admin of an activated organization owns a verified domain
- **WHEN** they POST `/api/organization/domains/:id/rotate`
- **THEN** WBS issues a fresh organization-and-domain-bound TXT value and keeps the old proof eligible for less than 24 hours
- **AND** the old proof cannot advance the success time after that deadline; a successful new proof clears the old digest
- **AND** inactive, foreign, lost-authority and non-verified claims receive typed 403, 404 or 409 refusals without changing the proof

#### Scenario: Suspended domain cannot qualify for approval

- **GIVEN** a domain claim is suspended after 14 days without successful proof
- **WHEN** the join-approval path checks claim status
- **THEN** only an exact currently verified claim qualifies; suspension retains ownership and existing memberships

#### Scenario: Suspended owner recovers

- **GIVEN** A owns a suspended domain after no successful proof for 14 days
- **WHEN** A restores the retained TXT proof or rotates it with a fresh challenge and verification succeeds
- **THEN** A returns to verified status and onboarding resumes, without releasing ownership or changing existing memberships

#### Scenario: Transfer requires fresh proof

- **GIVEN** A releases its verified domain
- **WHEN** B requests ownership without a fresh B-bound TXT proof
- **THEN** B remains unverified
- **AND** release invalidates B's pending challenge issued before release; B must issue a new organization-bound challenge and pass authoritative verification before becoming the owner
