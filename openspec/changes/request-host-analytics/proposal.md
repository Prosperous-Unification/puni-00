# Request hostname analytics

## Why

The continuation application is moving from app.puni.dev to request.puni.dev, with corresponding development hosts. Analytics must recognize the canonical request hosts while preserving environment isolation.

## What Changes

Approve exactly dev.puni.dev plus dev.request.puni.dev for development and puni.dev plus request.puni.dev for production. Reject legacy app, crossed-environment and unknown hosts. Preserve the puni.dev cookie ancestor, preference namespaces, measurement identities, consent, route admission and privacy behavior. Update public browser fixtures to use the canonical hosts.

## Capabilities

### New Capabilities

- `request-host-analytics`: exact environment-specific website and request analytics hosts.

### Modified Capabilities

None.

## Impact

Only the public analytics adapter and affected website frontend fixtures change. Private gateway redirects precede execution of new application JavaScript. Private release projection, DNS, TLS and deployment are managed separately; production deployment remains held.
