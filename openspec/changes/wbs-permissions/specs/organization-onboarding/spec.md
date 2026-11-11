## MODIFIED Requirements

### Requirement: Invitations are bound and single use

A current personally authenticated issuer SHALL create a revocable invitation for one normalized recipient email and organization with explicit initial access or none and an expiry. The public issue/approval field SHALL be optional nullable initialRoleId from org-admin, org-viewer, project-contributor and project-viewer; omission or null SHALL normalize into a fresh internal none selection before awaits. Legacy role bodies SHALL be rejected. Every public invitation summary SHALL include nullable initialRoleId. Issuance and actual new-member initial-grant insertion SHALL obey P11 current membership, grant permission and full-set subset checks; none grants no authority. Creator and invitation initial grants SHALL NOT be inferred from legacy membership roles.

The active-organization invitation GET/POST/DELETE SHALL recheck current grants in their store owner. Listing and cancellation SHALL require organization.manage_members. A caller with only that effective permission SHALL be able to cancel any pending offer, including org-admin or org-viewer: cancellation creates/removes no actual access grant or membership. This explicitly replaces the prior administrator-role restriction forbidding an admin from cancelling an admin offer. Actual organization-kind grant revocation and organization-role-holder membership removal retain P11's additional organization.manage_organization_roles requirement. Missing and foreign invitation IDs SHALL have the same 404.

Acceptance SHALL require a personal session with write scope and the current durable verified matching email, consume once, and create or retain membership atomically. New-member initial access SHALL recheck the stored personal issuer's current P11 authority and insert its grant and access_granted audit in that same owner as consumption and membership; the issuer is grant creator/audit actor with origin invitation, while the recipient remains membership/acceptance actor. An existing member's offer SHALL consume without upgrading membership or granting access. Expiry/revocation/concurrent replay SHALL refuse. Missing issuer provenance or malformed/missing trusted initial selection SHALL throw; the incoming runtime SHALL read only the new selection. Acceptance success SHALL name membership.organizationId without a legacy role label.

Issuance SHALL use the injected mail port, store only token digests, compensate failed delivery, and return503 delivery_failed on expected delivery failure. All four routes SHALL refuse before activation; delegated callers SHALL receive403 insufficient_scope before helper cap precedence. Nondelegated machine/consent evidence SHALL be capped before any grant row read, naming the selected role's grant permission or manage_members for none/non-grant operations. Personal admission checks manage_members, then kind-specific grant permission, then the first missing subset permission in canonical PERMISSIONS order.

#### Scenario: Membership clerk cancels an organization-admin offer

- **GIVEN** a personally authenticated current member with only organization.manage_members and a pending org-admin initial-access offer
- **WHEN** they cancel the offer
- **THEN** the offer is revoked without any membership or access-grant mutation
- **AND** removing an existing direct organization-role holder still refuses without organization.manage_organization_roles

#### Scenario: Explicit none survives outgoing-writer compatibility

- **GIVEN** a new offer explicitly selects no initial access
- **WHEN** it is stored alongside outgoing-writer role offers and later accepted
- **THEN** its initial selection remains none and its new membership receives no grant
