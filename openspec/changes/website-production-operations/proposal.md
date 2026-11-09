## Why

The owner requested unattended production preparation for puni.dev and request.puni.dev, durable intake, notifications and working logs. Current live production serves a placeholder, the request hostname has no DNS, and website-prod does not exist. Submitted proposals are durable but have no notification delivery. Cluster observability is suspended.

## What Changes

Prepare the existing production environment with isolated storage, secrets, backups, routing and retained logs. Add durable request notifications, independently retryable after network failures and process restarts. Verify a synthetic production request through save, notification, backup and restore, using direct host routing before DNS when necessary.

## Non-Goals

Increasing paid-provider limits, enabling analytics, migrating development prospects, enabling erasure, publishing new owner-authored content, or replacing the fleet/release architecture.

## Constraints

The user's current instruction authorizes preparation and routine infrastructure actions without additional questions; older preparation-only holds do not redefine this objective. Preserve exact-source gates, licensed-source boundaries, additive migrations with down.sql, current development state, origin security and backup verification. Never expose credentials, contact details or brief content in logs or notification bodies. Evidence must distinguish delivery-provider acceptance from human receipt. DNS and TLS limitations must remain explicit until verified.

## Capabilities

### New Capabilities

- `request-notifications`: transactional notification capture and restart-safe delivery.

### Modified Capabilities

None.
