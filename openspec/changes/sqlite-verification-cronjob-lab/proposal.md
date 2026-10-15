## Problem

F10 requires live scheduled SQLite verification in `wbs-solver`. The disposable backup lab executes `sqlite-backup` and a separately constructed restore Job, so it does not establish that the shipped verification CronJob works with its scratch volume, credentials, runner and admitted backend identity.

## Outcome

Extend the existing lab to create Jobs from the rendered `sqlite-backup-verify` CronJob. A migrated snapshot containing the known project must verify successfully. Missing backups, damaged snapshot bytes, a report with a different migration set and an unapproved image must be refused on the production runner or admission path. Each fault uses a separate prefix in the lab object store; verification Jobs keep the shipped command and security fields.

## Non-goals

No production cluster, credentials, release coordination changes, host maintenance, cloud CSI or WBS release rollout. This does not close the remaining F10 real-host work.

## Constraints

Use repository locked k3d/Kubernetes binaries and images, build the real backend image, preserve the existing restore proof, keep kubeconfig and credentials disposable, and record fresh commands and failure evidence. The authorized F10 design already establishes scheduled verification terminology and behavior; no new domain term is introduced.
