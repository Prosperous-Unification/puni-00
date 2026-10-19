## Scope and inputs

This follow-up enrolls only nodemailer. Governing contracts: ../twilight-burokrat-package/specs/package/spec.md and ../wbs100-dns-trusted-declarations. Source starts at 7d445c48d471a90e885e3d06069d466b8cb8ac13. Preserved DNS archive SHA256 d54a0bb4c601baa25630f0325d3dd29966a2042bd0e98c9d62b9efca8b269fd8 is copied to /tmp/wbs100-mail-closure-20261020/twilight-burokrat-0.1.0-dns-7d445.tgz.

The closed import audit /tmp/wbs100-import-audit-20261020/report.json has SHA256 a1ef44b3cffb4ad2e3f036f6827574311d30c2edf32e09cb4770dc363fb33352. Its static census of 21 configurations, 1,160 workspace files and 34 package spellings identifies only nodemailer as absent. It does not establish compiler success.

The DNS successor full baseline /tmp/puni-wbs100-dns-surveys-20261019/full-base.stdout is the production omission observation: seven relationship rules refuse apps/wbs/be-01/src/runtime/email-delivery.ts -> nodemailer/lib/smtp-connection. No remaining intermediate surveys are run here.

## Execution boundary

Each command uses the retained guard with 2 GiB process-tree RSS, 360 seconds and preflight 12 GiB available memory. Guard wrapper exit zero also permits expected child exit one; receipts and actual diagnostics determine pass/fail. Raw UTF-8 streams will be retained with SHA256 and byte counts. Full surveys, hosted CI and h2puni are unverified until coordinator evidence is recorded.

## Observed omission and restored namespace

The [closure RED](evidence/closure-red.json) completed with 14 pass / 2 fail before production edits, naming absent nodemailer. The [preserved installed package RED](evidence/installed-red.json) failed at `src/index.ts -> 'nodemailer/lib/smtp-connection'`, with child exit 1, no guard stop, 4.781 seconds and 1,137,480 KiB. This verifies the real installed extraction boundary rather than inferring dispatch from help text.

Adding the sole nodemailer root passed the [complete focused closure suite](evidence/closure-green.json): 16 tests, zero failures, 163,972 KiB and 0.456 seconds. The exact fixture excludes an unrelated package and explicitly excludes @types/nodemailer. Existing malformed, absent, unreadable, symlink and nested-instance checks still run.

The [Nx package build](evidence/pack-green.json) passed at 739,872 KiB in 6.957 seconds. This is explicitly a dirty/precommit artifact: sourceRevision still names 7d445, while [source hashes](evidence/green-source.json) and [patch](evidence/green-source.patch.json) bind the actual edited bytes. [Artifact metadata](evidence/green-artifact.json) identifies archive e5745c95ca8982dd706955ec217658de5efe326caf8d47741e6b4405f338e3b3 and verifies nodemailer present, @types/nodemailer absent. It is not relabeled as an exact-commit package.

The [installed oracle](evidence/installed-green.json) passed one test / 57 assertions, zero failures, in 57.022 seconds at 1,433,100 KiB, no resource stop. Its real fixture imports the SMTP subpath as both a value and a named type, exports createSmtp(options: SMTPConnectionOptions): SMTPConnection, and requires those public declarations. Bubblewrap hides the source checkout; candidate node_modules remains absent. The existing missing/corrupt vendor controls now also remove and alter the selected bundled ESM SMTP declaration, demand toolkit-authentication refusal with empty stdout, restore exact bytes and compare the full successful report after each fault. DNS and YAML controls remain exercised.

## Review and static checks

Independent source/proof review cleared trusted-modules.ts SHA256 1d984eb1fcf893cf22e43c272826daabbebc8628cd0c08f8fa7957aa470994d2, trusted-modules.test.ts 34c040dbafbbc89de5da46d749e39f4f178ae0b207128320b3cd6c08ec721910 and install.test.ts 41ab4adea20b116cc1c0038791ffeee376d4f719a18a8cc454b8800fb8549582. The reviewer independently read both omission receipts and GREEN receipts, checked the finite root and public-type/fault semantics, and did not rerun heavy tests.

[Scoped ESLint](evidence/lint.json) passed with max-warnings zero and no boundary skip, 3.518 seconds / 740,252 KiB. [Full package typecheck](evidence/typecheck.json) passed, 1.432 seconds / 1,396,408 KiB. [Pinned strict OpenSpec validation](evidence/openspec.json) passed one change with zero issues, 0.307 seconds / 111,488 KiB. [Input identities](evidence/unchanged-inputs.json) verify package.json, bun.lock, serial extraction, import resolution and package building remain byte-identical to HEAD.

Raw streams are retained in UTF-8 text envelopes with exact byte counts and SHA256 hashes; decoding the text restores the original bytes. No new binary evidence is committed. The final formatting, normal-hook commit and exact-commit installed successor remain to be recorded. Coordinator full surveys, CI and h2puni gates are not established by these focused checks.
