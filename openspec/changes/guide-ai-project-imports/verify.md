# verify — guide-ai-project-imports

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid. File-scoped bunx prettier --check exited 0 for all six packet files.

## Planned commands — pending implementation

- Focused guide-content and frontend browser tests, then `bun run e2e` for the Import with AI help path.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`, file-scoped `bunx prettier --check`, and `bin/h2puni-gate.sh <sha>` on h2puni at the committed implementation SHA.

## Planned checks — pending implementation

- **Pending:** Guide-content check for every named client, status/version/date, destination organization/role approval, fresh authorization on switch, scope and callback cautions, exact copyable prompt, source mapping, troubleshooting and no token-copy or native `.mpp` promise.
- **Pending:** Browser and accessibility checks for Export / Import → Import with AI, working guide link and copy controls.
- **Pending:** Live-client evidence per tested label: version/date, callback, registration, read/write scopes, grant-bound organization and role, ordinary-user read and reversible write, actual refresh and revoked-token denial. Clients lacking this remain untested.
- **Pending R5 proof:** Remove a client row or introduce a false tested label; content check must fail. Restore and record output.
- **Pending R5 proof:** Break the in-app guide link or copy prompt; browser check must fail. Restore and add adjacent Proof: comment.
- **Pending:** Public URL and authentication prerequisite from `enable-public-mcp-client-auth`; format, lint, typecheck and host gate. No live client connection or application behavior has been verified at spec time.

## Implementation — WBS 010.4.9, 2026-09-27

Guide `docs/import-with-ai.md`; help `apps/wbs/fe-01/src/components/wbs/import-with-ai-help.tsx`
under Export / Import; prompt `import-with-ai.ts`. Based on the MCP refresh branch (#136), whose
`HOSTED_REDIRECTS`, loopback rule and scopes the guide states.

- `import-with-ai-guide.test.ts` (node tier) checks all 24 rows, allowed statuses, a date per
  row, a source link per row, ChatGPT unsupported, the prompt equal to the in-app constant,
  organization/role and fresh-authorization wording, `wbs:read wbs:write`, source and
  troubleshooting sections, no bearer/header token instructions, `.mpp` only negated, and the
  placeholder URL. `import-with-ai-help.test.tsx` (jsdom) checks the dialog's name, trigger,
  Escape and focus return, five steps, guide link, exact prompt copy, refused and absent
  clipboard, the unpublished-URL state and verified-URL copy.
- **R5, observed 2026-09-27:** deleting the Raycast row failed `gives every reviewed client
exactly one row`; relabeling Zed `WBS import tested` failed `labels no client tested`; one
  changed prompt word failed `carries the same prompt`; a relative guide href, a truncated copied
  prompt and a forced verified-URL branch each failed their help test; removing the menu entry
  failed `offers plan transfer controls in one Export / Import menu`. Each restored to green.
- **Deviations from the design table, from vendor docs and source checked 2026-09-27:** a fourth
  status, `Unsupported`, marks clients whose callback WBS refuses today (ChatGPT, Mistral,
  Copilot Studio). Cursor, VS Code and Continue move to bridge fallback: their DCR registrations
  carry a callback WBS refuses (`cursor://`, `https://insiders.vscode.dev/redirect`, a loopback
  URI with its own `state` query), and one refused URI refuses the registration. Raycast moves to
  unverified (MCP callback unpublished). Roo Code is discontinued; Amazon Q CLI is now Kiro CLI.
- **Astra review (gpt-6-astra, high), 2026-09-27:** no Critical. Important fixed: the Export
  menu closed under a pointer in its own portaled dialog, hiding the focus-return trigger
  (`close-on-outside-pointer.ts` now treats a dialog whose `aria-controls` trigger is in the
  panel as inside; dropping that check failed `keeps Export / Import open while its Import with
AI dialog is used`); the loopback rule now lists all six reserved query fields, literal ports
  and no fragment; `temporarily_unavailable` and `access_denied` causes corrected; dependency
  reach `whole-item` stated; the bridge is labelled an untested candidate and the spec and design
  now say so, with `Unsupported` added to the status vocabulary. Minor fixed: refusal shape and
  source-link storage wording.
- `e2e/import-with-ai.spec.ts` drives the real menu, keyboard open, prompt copy through the
  clipboard and Escape focus return. It was **not run locally**: `plan-import.spec.ts` fails the
  same way here (sign-in page shows "The server returned an unexpected response"), so the local
  stack is broken for every seeded spec; CI `pixels` runs it.
- **Not done:** no live client connection, so no row is tested (task 3.1); the `mcp-remote`
  bridge is pinned (0.14.3) but has not been run against WBS; the public URL stays
  `<WBS_MCP_URL>` until the production overlay serves it.
