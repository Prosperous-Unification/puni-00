## Ordered proof slices

- [x] 1. Require the verification outcome and specific failure cause; watch the three missing-guard negatives fail, then pass after implementation.
- [x] 2. Create verification Jobs from the actual `sqlite-backup-verify` CronJob; preserve its command and identity when changing a fault prefix. Execute the known snapshot and complete migration-set proof through the production backup/verify CLI.
- [x] 3. Upload isolated damaged-byte and changed-migration-report fixtures using the lab injector; execute the production verification CLI against them and an empty prefix. Watch each corruption test fail when its production comparison is removed; restore and rerun.
- [x] 4. Derive the verification Pod from the actual rendered CronJob and observe locked prior Bun-image denial and backend-digest admission on the disposable Kubernetes API. Add adjacent observed Proof comments.
- [x] 5. Run scoped Bun/Nx, changed-file format and OpenSpec validation; record evidence and limitations, delete disposable resources, and prepare a normal commit.
- [ ] 6. Complete the full shipped-CronJob execution on disposable k3d after the repository-locked MinIO image becomes publicly retrievable. The rehearsal currently stops at its 401 image-pull failure; the local S3 fixture does not certify this slice.
