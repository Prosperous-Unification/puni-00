## Why

The app remains blank while JavaScript downloads, and its promotional footer interrupts the focused request journey.

## What Changes

Show a small accessible initial loading status in the HTML document and replace the promotional footer with compact utility navigation consistent with the site.

## Capabilities

### New Capabilities

- `website-app`: Initial HTML loading feedback and utility footer.

## Impact

Only the public website frontend shell and footer change. No API, request bytes, consent, provider activation, deployment or private licensed source changes. Existing React mounting replaces the initial shell without a delay or additional app request.
