## 1. Image-local authority

- [x] 1.1 Add additive receipt migration and guarded down — test: receipt DB suite; negative: enabled empty down, retained receipt, malformed marker preserve ledger.
- [x] 1.2 Add atomic exact receipt transition and inspect — test: receipt DB suite; negative: receipt insert failure rolls back marker, changed authority and conflicting retry refuse.
- [x] 1.3 Add strict existing-file image-local CLI — test: activation CLI suite; negative: absent DB_PATH, missing database, malformed receipt and unexpected arguments refuse; inspect leaves file bytes unchanged.

## 2. Deployment admission

- [ ] 2.1 Add step_blockage_activation_v1 image capability and independent enabled-empty inventory for Compose/Kubernetes — test: candidate/rollback incompatibility negatives and empty ENABLED inventory.
- [ ] 2.2 Add explicit Compose activation flag and inspect, durable intent and exact fenced execution/readback — test: uncertain commit/readback retains all barriers and never exposes or restarts writers.
- [ ] 2.3 Document preserve-only deployment then attended activation with a capable rollback; retain Kubernetes first-start DISABLED guard — test: first-start enabled refusal and operator runbook review.
