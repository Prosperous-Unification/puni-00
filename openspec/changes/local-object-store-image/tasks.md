## Implementation

- [x] 1. Add production-builder negatives for altered checksums, rejected signatures, failed builds, and manifest mismatch; watch fail before implementation.
- [x] 2. Implement locked binary verification and deterministic image build; prove actual minisign refusal with corrupted signature and checksum.
- [x] 3. Build twice with varied mtimes/umasks and lock the observed manifest; update local consumers and import into the disposable lab.
- [x] 4. Prove shipped server/bucket Job image IDs, buckets/versioning/lifecycle and two generations; inject a bucket failure and observe refusal.
- [x] 5. Run repaired PR #459 backup lab and record its real backend backup/restore/verification and injected refusal evidence.
- [x] 6. Prepare object storage before general platform/fleet Flux bootstrap; prove caller refusals and attempt real profile startup without bypassing resource guards.
- [ ] 7. Finish scoped checks and OpenSpec verification, normal-hook commit, independent review and exact locked host gate; record limitations and evidence.
