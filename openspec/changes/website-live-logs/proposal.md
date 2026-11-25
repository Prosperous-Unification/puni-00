## Why

Website operators need a quick way to read the current development and production application logs.

## What Changes

- Add a command for each website environment that reads recent logs through the existing H4 SSH alias.
- Support the API, app, and site deployments, with an option to follow new output.
- Validate the selection locally and keep reads scoped to a website deployment.
