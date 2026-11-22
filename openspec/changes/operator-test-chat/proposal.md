## Why

PUNI operators need to repeat the ordinary visitor journey in development and production to evaluate the dialogue. The preview reset renews the current conversation while leaving history on screen.

## What Changes

- Add a reset URL on the requests app. It uses the existing signed-in operator session.
- Detach the browser from its previous chat and refresh its scoped conversation allowance. Retain saved messages and accounting.
- Return to the normal public intake form. All ordinary turn limits and site-wide protections continue to apply.

## Capabilities

### New Capabilities

- `operator-test-chat`: Reset the current browser for another ordinary visitor walkthrough.

## Domain Terms

- Chat reset

## Decisions Recorded

None.

## Impact

Requests app bootstrap, operator API and the existing SQLite conversation allowance reset. Development and production releases both require app and API updates.
