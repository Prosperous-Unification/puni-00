## 1. Durable anonymous admission

- [x] 1.1 Implement migration 014, the content-free ledger, ten-attempt cap, browser cookie binding, rolling source/browser ceilings, durable fresh-conversation windows and hourly/monthly site ceilings; integrate the API with existing response states and preserve guided-scoping recovery. Tests: mounted repeated-stop refusal, retained-cookie/new-source, cleared-cookie/same-source, midnight, restart, two-connection final-admission races, retained-accounting after cleanup and full migration rollback. Negative: remove each guard or ledger-maintenance dependency and watch its production-path test fail; record exact commands in verify.md and adjacent Proof comments.

## 2. Preview testing reset

- [x] 2.1 Add preview-only secret configuration, origin/secret-checked POST and scoped reset baselines without deleting billing or history; fence in-flight attempts. Add fragment consumption before app analytics/initialization. Tests: authorized reset then paid admission, disabled/wrong/foreign/production refusals, retained site ceilings and in-flight fencing, URL secret removal and no normal-startup request. Negative: remove each guard/fence/fragment scrub and watch the corresponding test fail.

## 3. Forwarded-source boundary and deployment

- [x] 3.1 Implement trusted-socket validation and private gateway/runtime/network policy wiring. Tests: valid gateway, untrusted/missing/malformed peer, forged forwarded source, alternate IPv6 spellings, actual gateway/cluster isolation and configuration checks. Negative: bypass the peer/header/network guard and observe the applicable test fail.

## 4. Verification and release

- [ ] 4.1 Update runtime/privacy/runbook knowledge and verify.md with fresh targeted tests, lint, typecheck, builds, frontend regression and the R5 proof matrix; independent review and canonical public host gate on the exact SHA. Record unavailable checks explicitly.
- [ ] 4.2 Merge the reviewed public change, refresh the five private snapshot trees and receipt, build/test/publish the development release, commit its fleet pin/runtime changes, deploy and verify served identities, retained data, normal anonymous flow and secret reset. Keep production and provider credentials/caps unchanged. Record complete applied migrations and the concrete rollback procedure before rollout.
