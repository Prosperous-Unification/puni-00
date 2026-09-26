## 1. Make the guide's claims testable

- [ ] 1.1 Add failing documentation checks for all 24 named clients, their status/version/date, exact prompt, scope guidance and absence of token-copy instructions or unproven tested labels.
- [ ] 1.2 Write `docs/import-with-ai.md` with source-specific preparation, client configurations, bridge conditions, troubleshooting and the copyable prompt. Use the public URL only after change D's live proof.
- [ ] 1.3 Inject a missing client row or false tested label; watch the documentation check fail, restore and add an adjacent Proof: comment.

## 2. Surface help in the editor

- [ ] 2.1 Add failing keyboard, screen-reader and browser tests for Export / Import → Import with AI, copy connection URL, copy prompt, and accessible help content.
- [ ] 2.2 Link the menu to the canonical published guide and present the five-step flow without duplicating stale client data.
- [ ] 2.3 Break the help link or copy action; watch a user-path test fail, restore and add a Proof: comment.

## 3. Record actual client support

- [ ] 3.1 For each client claimed tested, record application version/date, callback, registration method, requested/granted scopes, read, reversible write, actual refresh and revoked-token refusal at the live public URL. Keep untested rows in documented, bridge fallback or unverified status.
- [ ] 3.2 Run focused docs/UI checks, format, lint, typecheck, OpenSpec validation and applicable host gate. Record outcomes and skipped live clients in verify.md.
