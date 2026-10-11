---
status: proposed
---

# Enterprise SSO is a WBS connection record, and WBS serves SCIM

An organization's enterprise SSO is a WBS record. It ties a verified domain to the name of an Auth0 enterprise connection. Login is routed with Auth0's `connection` parameter. Enforcement compares the authenticating identity's `sub` against the subject prefix `{strategy}|{connection}|`, and a connection must first be proven by a real login through it. Directory provisioning is a SCIM 2.0 `Users` service hosted by WBS for each organization. Its deprovision removes membership and ends WBS access in the same transaction.

We chose this so that WBS membership stays the only organization authority (see `organization-ownership-and-access`), and so that deprovisioning does not wait for an asynchronous delivery. Details: [design](../../openspec/changes/organization-enterprise-sso/design.md).

## Considered options

- **Auth0 Organizations** (`organization=` and an `org_id` claim). Rejected. It would add a second membership source, Management API credentials and a plan-gated organization count. Reversal cost is moderate, because each record maps one-to-one onto an Auth0 Organization.
- **Auth0 inbound SCIM with an event-stream webhook.** Rejected. Auth0 blocks the Auth0 user, but WBS membership and issued WBS credentials outlive the webhook delivery.
- **The strategy prefix alone** (`samlp|`). Rejected. Auth0's documented enterprise `user_id` examples carry no connection name, so the strategy prefix cannot tell customers apart.

## Consequences

- **Hard to reverse.** Customers configure the WBS SCIM URL and provisioning token in their own IdP. Moving SCIM to Auth0 later requires every customer to change their configuration.
- **Fallback for enforcement.** If a proof login shows a connection's `sub` lacks its connection name, enforcement needs an Auth0 post-login Action claim. That is a new decision.
