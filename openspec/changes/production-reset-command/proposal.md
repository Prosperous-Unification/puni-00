## Why

The production operator needs a shell command to open the authenticated browser reset without copying a credential or invoking Kubernetes.

## What Changes

Add `puni-website-prod-reset` with help and a print-only option. The browser's existing operator session and confirmation authorize the reset.

## Capabilities

- `website-operations`: Open the production reset through a local command.
