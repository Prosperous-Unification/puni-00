# Bounded task 8.1 mounted import compatibility (2026-10-23)

`plan-import-compatibility.controller.db.test.ts` mounts the production application
and SQLite composition with `OrganizationHarness.openComposedWith({})`. It adds no
synthetic importer or harness option and does not activate public external import.
The production `INACTIVE_EXTERNAL_DEPENDENCIES` binding remains unchanged.

The outgoing-only source is downloaded through mounted JSON export as v11. Its
project carries its already claimed abbreviation, its connected observation names
the outgoing relationship, and its authored typed list contains only its internal
relationship. Mounted import succeeds, creates three rows in a new project with a
distinct abbreviation in `org:org-a`, preserves the source abbreviation and all
external relationship rows, and re-exports the imported internal relationship.
This covers destination allocation for an archival address already held locally.
It does not establish successful public import of incoming external declarations.

Future-version cases start with a real mounted export, change its version to 12,
and separately leave its content intact or corrupt a row priority. Both return
exactly 400 `unsupported_version` at `document.version`, with null detail. A
canonical snapshot of every application table remains unchanged. Legacy versions
1, 2 and 3 import `anchor-slice`, preserve the stored project setting and re-export
it. Version 1 omits its historically absent step allowance field.

## Watched production faults

Each fault was applied separately, exercised, and restored before final checks.
Adjacent `Proof:` comments identify the observations in the new test file.

| Fault                                                                                           | Observed failure                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Force the supported-version fence false in `classifyPlanDocument`                               | Two failures: intact v12 imported with 201; malformed v12 returned `invalid_body/workItems[0].priority` instead of the exact version refusal. |
| Replace `depReach: settings.depReach` with `depReach: 'whole-item'` in `plan-import.feature.ts` | All three legacy cases failed their stored `anchor-slice` assertion with `whole-item`.                                                        |
| Make the SQLite project allocator accept occupied name candidates                               | Outgoing-only mounted import returned 409 instead of 201 because the source abbreviation was already claimed.                                 |

Commands use `bun test ./apps/wbs/be-01/src/controller/plan-import-compatibility.controller.db.test.ts --timeout=30000 -t <filter>`
with filters `unsupported v12`, `legacy`, and `outgoing-only`. Fault logs are
`/tmp/task81-import-fault-{classifier-final,reach,allocator}.log` in the implementation workspace.

## Validation and limits

The focused command runs the new compatibility file together with
`cross-project-import.controller.db.test.ts` and
`cross-project-export.controller.db.test.ts`. Final counts are recorded in the
linked `verify.md` entry. Focused ESLint passed, with the explicit warning that
`@nx/enforce-module-boundaries` was skipped because the isolated worktree had no
cached project graph. `tsc --project apps/wbs/be-01/tsconfig.spec.json --noEmit`
passed. No host gate, full lint/build, browser/E2E, MCP, old-binary or live rollout
checks were run for this bounded acceptance packet. Parent task 8.1 stays open.

## Capable mounted incoming-v12 transaction acceptance — 2026-11-02

The preceding October23 record describes its historical dormant/v11 epoch. Current backend immutable capability supportsV1; activation authority remains a separate requirement. This bounded test closes one concrete product intersection: the rich incoming-v12 export previously called the synthetic importer directly, while mounted positives covered outgoing-only content. One local helper now shares the complete original round-trip assertions between its unchanged historical synthetic title and the new `capable mounted incoming v12 import preserves stable external identities and owned remapping` case. The mounted variant supplies the actual BACKEND_DEPENDENCY_CAPABILITY, omits syntheticTransferImports and asserts the synthetic importer is absent, then POSTs the raw downloaded document through the authenticated mounted endpoint. It requires201 and validates the existing public importSummary schema before consuming its projectId.

Both variants assert fresh project/work-item/step/relationship IDs and a distinct allocated destination abbreviation, all five incoming stable predecessor scope/step/type identities, correct successor remapping, local typed SS/legacy content, unchanged foreign-owned rows and unchanged command/plan-event/saved history. Existing incapable false/true controls remain byte-exact and require500, identical all-table snapshot and zero pushes. The fixture seeds trusted test authority in isolated SQLite; it does not establish genuine deployment exclusion/activation.

Scoped format, configured forced uncached backend types (including typecheck:module), populated-boundary owning lint and format-check passed. The initial static attempt failed TS2307 for an undeclared schema subpath; using the existing public @wbs/contracts barrel fixed only that import. The failure remains preserved. Final owning43856 bytes SHA25677c953145bde7db0430c849dbbce69f04699858e5ae5b4eab326c07e5978b944,mode0664; protected descriptor/harness/fixture/composition inputs remain exact. Independent source/static review62be0d3bc92c14b4cf272af7bc399d02076b8f49a3c227e0364459a845d5aaa0 authorized the exact four selected cases and existing generator prerequisite.

The existing uncached `wbs-be-01:prepare-mcp-document` target actually ran once, original75269 joined0/f74322. Its generated OpenAPI output was absent beforehand, then4061532 bytes SHA2563587f1ce57604cc2e402f20317236072e2802a004a7688be7e14fc17de5d8b86 and unchanged after tests. An earlier preparation assumed that generated output existed and refused before any generator/test; its r1 namespace preserves that error and missing-start launcher refusal. The corrected r2 freezes absence honestly; there was no subject retry or source correction after execution.

One focused direct Bun invocation from apps/wbs/be-01, using the existing shared scratch preload and10000ms case limit, then passed4/18filtered/0fail/109assertions9.16s. Original99353 joined0/ad2eab. Exact selector contains the unchanged synthetic rich case, new capable mounted case and existing incapable false/true cases only; no fabricated RED or broader backend/store gate is claimed. All18 source pins,30 config absences, trusted Bun/Node and generated artifact matched after completion. Scratch retained only node-compile-cache, not an empty tree; the existing cleanup hook returned normally.

Private packet `/tmp/puni-capable-mounted-import-four-actual-r2-20261102/` retains full generator/test streams and original outcomes. Test stdout2320 bytes SHA256aea191b0265674eb952e1be8c29df4b3e326ebca96fa3dc6bf08f6f0cf350c30; stderr676 bytes SHA256881bff6c896efcf2673db8a43c5fd1b0db9ced087af2640b2d6686364db63c9b. Independent actual audit51e3a26e74f2c9acf9683c7ce1fe4ee86d4df6e11d1cbb661f23885089c4cfda verifies the complete four-case result and exercised assertions. No new production safety predicate was introduced, so no additional mutation campaign is needed for this acceptance-only extension.

This accepts only the capable mounted incoming transaction/persistence intersection. Full mapping/revocation/version/rollback transport matrices, genuine activation/continuous participant fencing, browser/MCP/fullCI/gates and main delivery remain open. Parent8.1 stays unchecked; prior historical evidence is not relabeled and no live service/deployment was changed.

## Capable mounted late-event rollback — 2026-11-02

The original rich synthetic recording-failure test now shares its unchanged assertions through assertImportRecordingRollback with one new capable mounted callback. The latter supplies the real immutable backend capability, has no synthetic importer and POSTs the downloaded v12 document through the mounted route. The spy calls the original DrizzleEventLogStore.recordEventIn with its actual receiver/arguments, then verifies actual staged project/rows/steps/abbreviation/organization/local and five external links, predecessor revisions, inserted durable elsewhere event and sequencer increment before throwing the deliberate recordingFailure. The completion marker is set only after ALL those transaction assertions. Synthetic mode verifies exact error identity; mounted mode requires opaque500 and makes no cause-identity claim. Both positive cases then require the full table snapshot restored and zero pushes. Existing mounted shared-capacity rollback is different coverage and remains unchanged.

One fresh required uncached OpenAPI generation returned0 (original27855→db2241), preserving4061532-byte generated artifact SHA2563587f1ce57604cc2e402f20317236072e2802a004a7688be7e14fc17de5d8b86. One exact six-case run returned0 (31404→fb08a8):6pass/17filtered/0fail/154assertions12.78s, comprising the prior four acceptance/refusal controls and both rich rollback modes. All18 source pins/30 config absences/tools/artifact matched; scratch retained only node-compile-cache, and the normal cleanup hook returned. Configured forced backend/module types, populated lint and format checks had passed on owning585c2b5d74058b3a11f5e450d29f720382562ab795c6272d5bcc842396ca630f. Independent actual auditdc7be59f340c2d87111455a9d91ebb887367035ef2d8760279f2666941a5a924 accepts only this mounted transaction/late-event rollback intersection, not complete8.1 or real activation.

A separately scoped single dependency fault inserted a mounted-only false spy assertion immediately before the completion marker. HTTP still returned500, but the SAME final expect(injected).toBe(true) failed at1030:20:0pass/22filtered/1fail/21assertions6.04s (original82452→7dc120). Exact full585c restoration then passed the SAME selected mounted case:1pass/22filtered/0fail/22assertions6.14s (63892→de31c1). The final marker failure occurs BEFORE later negative-case full-table/push assertions; those later assertions are not credited to the negative. The restored positive covers them. This proves the test refuses swallowed early assertions, rather than accepting any500. No stronger opaque mounted error identity is inferred. A fresh required generator ran once for this pair; no alternative fault or subject retry occurred.

Pair packet `/tmp/puni-mounted-import-marker-pair-actual-r1-20261102/` preserves all originals/raws and exact114f42b3ea9e1a12cb7cd02c15c6132d00c067dd3990fc0e9300a0c2bc7a7ff3 negative/585c restoration images. Negative stderr982 bytes SHA256398a155dfaedbd84d1a0ae281fc97cc8812b1aae7b303e7b3f250fcc4e96a8d9; restored stderr367 bytes SHA25669246f8e54bd713e4ca61f346fe9c51a52f63fd6a6bcec52c70ea28da0f986a3. Independent actual audit1fa97c02afef0d066d9d8b53ac997eab00090ab1c1105728cb07184688923e09 matched18 sources, two tools,30 absences, streams and images. Both phase scratch directories were empty; generator scratch retained node-compile-cache. Generated before/after pair metadata binds bytes/hash only; no extra historical mode observation is invented.

One adjacent Proof comment was then added; exact removal reproduces585c source. Scoped format/populated-boundary lint/formatcheck passed0 with original joins,17 protected sources unchanged and no skipped lint. No types/compiler/subject tests were rerun solely for that comment. Final owning45118 bytes SHA256b513aa9af7e0792feb4c044b8f0ae810ac60bc06b63b181da0532703df7f584b,mode0664. Comment/static reportb56ae24660d6de0f46a29b3c5eb11619b8d574c4307fff4faea6fdf16a7ab412 preserves its exact narrow scope. No production implementation changed.

This is one actual capable mounted rollback boundary with fixture-seeded durable authority. Remaining version/mapping/revocation/public transport matrices, genuine activation/participant fencing, full backend/browser/MCP/CI/host gates and deployment remain open. Parent8.1 stays unchecked, and no broader acceptance or main adoption follows.
