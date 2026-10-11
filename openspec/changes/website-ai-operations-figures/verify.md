# Verification

## 2026-10-11 (branch `batch-10/website-ops-reconcile`)

Local only; the h2puni gate is the orchestrator's. Bun runs used `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

- `NX_DAEMON=false bunx nx run-many -t lint,typecheck,test -p website-be-01 website-fe-01 website-store-sqlite`: "Successfully ran targets lint, typecheck, test for 3 projects".
- Browser, AI-off stack offset by 3000 (API 6119, app 7219, `OPERATOR_PASSWORD`, `TRUSTED_PROXY_HOPS=1`, `RETENTION_JOURNAL=disabled`): `PUNI_SCREENS_STRICT=1 PUNI_SCREENS_PORT_OFFSET=3000 PUNI_SCREENS_ONLY=operator,operator-inbox,operator-guardrails,operator-funnel bun apps/website/fe-01/browser/screens.mjs` exit 0, 16 OK lines. The populated panels on the scripted-provider stack were captured at 1440 px and reviewed: `In flight now` reads `None`, the Funnel `Spend` for today equals `Today's spend` ($0.04).

## R5 proofs

| Check                 | Fault                                                     | Observed                                                                                                                                                      |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-flight count       | drop `state = 'inflight'`                                 | `(fail) the overview reports today's in-flight calls ...`: count 3, reserved 15000                                                                            |
| Restart keeps spend   | delete in-flight rows on restart instead of settling them | `(fail) a restart and a pause-resume keep today's recorded site spend`: Expected 7000, Received 1000 (settling at 0 is already refused by the schema's CHECK) |
| Daily spend           | subtract the ceiling-settled amount                       | `(fail) counts drafts, ...`: `spendMicroUsd` 2700, expected 5700                                                                                              |
| Spend cell            | delete the `<td>`                                         | `(fail) renders thirty UTC days and the chat share`                                                                                                           |
| Strict funnel parse   | default a missing `spendMicroUsd` to 0                    | `(fail) a malformed funnel body throws instead of rendering defaults`                                                                                         |
| Strict overview parse | default a missing `inflightToday`                         | `(fail) the in-flight line names the calls running now ...`                                                                                                   |
