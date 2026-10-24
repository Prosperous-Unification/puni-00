## 1. Host integration

- [x] 1.1 Implement a standalone Ansible registry playbook and roles for the private endpoint and clients, leaving existing server/agent roles unchanged. Inputs include hostname, private listen address, current registry ClusterIP, CA path, credential file and k3s service when applicable. Test: rendered units/configuration pass real consumers, a second apply converges; negatives: invalid CA, public listen address and unmanaged conflicting registries.yaml refuse before mutation, each watched with its guard removed.
- [x] 1.2 Prove private hostname resolution, TLS verification and uncached pulls on each eligible node; serialize necessary service restarts and verify website availability. Test: actual containerd pull and pinned-digest disposable workload; negative: wrong credential and absent CA fail the same path.

## 2. Credentials and controlled activation

- [x] 2.1 Generate root-only registry credentials and CA, encrypt them for the existing fleet recipient and prepare a dedicated private fleet secret Kustomization. Test: fleet checks and successful decryption on the target; negative: missing SOPS identity refuses decryption without outputting plaintext.
- [x] 2.2 Preserve the current platform revision and product digests; establish durable holds on unrelated dependent stages, then activate secrets and endpoint. Test: registry certificate/pod/platform Ready, holds persist after parent reconcile, existing website health and digests unchanged; negative: unauthenticated registry request returns 401 and the public-address endpoint is unreachable.

## 3. Recovery

- [ ] 3.1 Establish repeatable off-node registry backup and explicit failure reporting without launching unrelated platform services. Test: scheduled backup produces a verifiable archive and receipt; negative: injected transfer or archive corruption makes the backup/verification command fail.
- [ ] 3.2 Restore the backup into an isolated registry and verify a known manifest and every blob digest; prove the production registry retains the image across restart. Test: uncached digest pull from original and restored endpoints; negative: altered restored blob is rejected. Preserve all original storage and backups.
- [x] 3.3 Verify encrypted recovery materials can be recovered off-node. Record exact custody locations without credentials, and separately identify any human-owned offline/password-manager custody that remains unverified.

## 4. Review and handoff

- [ ] 4.1 Run focused tests, fault proofs, lint, typecheck, relevant infrastructure checks, OpenSpec validation and the canonical host gate on the final implementation SHA; obtain independent review and resolve material findings before completion.
- [ ] 4.2 Record commands, outcomes, revisions, rollback commands and operational limits in verify.md and the registry runbook; link from the platform documentation. Leave product migration unchecked in the original k3s-platform roadmap.
