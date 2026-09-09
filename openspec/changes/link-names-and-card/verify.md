# verify — link-names-and-card

Every row of the failure-proof table names the injected fault and the output that was
**watched**, never the output expected. Two of the rows below record a proof that was
first written from an expectation and was **wrong**; both are corrected here and in
`AGENTS.md`.

Run on this Mac (darwin 25.5.0, bun 1.4.2). `bin/h2puni-gate.sh` is h2puni's and exits
127 here, so the gate is CI's own commands run one at a time.

## Commands

| Command                                                        | Result                  |
| -------------------------------------------------------------- | ----------------------- |
| `nx format:check --all`                                        | clean                   |
| `nx run-many -t lint`                                          | 25 projects, 0 problems |
| `nx run-many -t typecheck`                                     | 25 projects green       |
| `nx run-many -t build`                                         | 12 projects green       |
| `openspec validate --all --json`                               | 64 items, 64 passed     |
| `nx run-many -t test`                                          | _see below_             |
| `CI=1 E2E_PORT_SHIFT=500 playwright test … external-refs`      | 10 passed (35.9s)       |
| `CI=1 E2E_PORT_SHIFT=500 playwright test` (whole browser gate) | _see below_             |

`E2E_PORT_SHIFT=500` and `CI=1` throughout, which is `bun run e2e:beside-dev`: the
committed Playwright config sets `reuseExistingServer: !isCi`, so a bare `bun run e2e`
would measure whatever holds 3100/3200/4200 — the landmine in `LLM_README.md`, and there
was a `bun run dev` on those ports for this whole session.

## Failure proofs

| Check                                                                           | Injected fault                                                                     | Watched failure                                                                                               |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `plan-cells.test.tsx` — lifts the links cell over the pinned layer              | `raiseWhenOpen` narrowed back to `columnId === 'name'`                             | `expected 1 to be 2`                                                                                          |
| `e2e/external-refs.spec.ts` — the card is drawn on top of the rows below it     | the same narrowing                                                                 | _filled in below_                                                                                             |
| `e2e/external-refs.spec.ts` — a card line … tints under the pointer             | the `[data-refs-card-line]:hover` rule deleted from `styles.css`                   | _filled in below_                                                                                             |
| `external-system.test.ts` — reads a Jira issue as its key                       | the `browse` arm removed                                                           | `Expected: "WCN-3887" · Received: "newsiteam.atlassian.net/WCN-3887"`                                         |
| `external-system.test.ts` — reads a pull request … as their number              | the GitHub arm removed                                                             | `Expected: "#4178" · Received: "github.com/4178"`                                                             |
| `external-system.test.ts` — reads a Confluence page as its title                | `readableSegment` reduced to the raw segment                                       | `Expected: "Cache warm-up plan" · Received: "Cache+warm-up+plan"`                                             |
| `external-system.test.ts` — reads an unclaimed URL as its host and last segment | the last segment dropped from the fallback                                         | `Expected: "example.test/thing" · Received: "example.test"`                                                   |
| `external-system.test.ts` — hands back a URL it cannot parse                    | the `catch` arm changed to rethrow                                                 | `TypeError: Invalid URL`                                                                                      |
| `external-system.test.ts` — names a scheme the renderer will not follow         | the empty-host arm removed                                                         | `Expected: "javascript:alert(1)" · Received: "/alert(1)"`                                                     |
| `external-ref.db.test.ts` — stores the name a link was given                    | `name` dropped from the insert's values, so the column takes its `DEFAULT ''`      | `- "SHED-9 Strip the walls" / + ""`                                                                           |
| `work-item.controller.test.ts` — takes a name … and bounds its length           | the length arm removed                                                             | `Expected: 400 · Received: 200`, the 301-character name stored                                                |
| `work-item.controller.test.ts` — the same case's type arm                       | the `typeof` arm removed                                                           | `- "error": "externalRefs_entry_name_is_not_text" / + "error": "invalid_body"`                                |
| `undo.db.test.ts` — puts a ref's name back, not just its address                | `revertTo`'s `name: each.name` deleted                                             | `- "name": "SHED-9 Strip the walls" / + "name": ""`                                                           |
| `plan-cells.test.tsx` — an unnamed link reads as the label its URL carries      | the `refLabelOf` fallback replaced by `ref.name` alone                             | `expected [ '', '' ] to deeply equal [ 'AB-1', '#4178' ]`                                                     |
| `plan-cells.test.tsx` — a non-http URL puts no link on the name either          | the name rendered as an `<a href={ref.url}>` regardless                            | `expected <a data-refs-card-name="ref1" …(4)></a> to be null`                                                 |
| `plan-cells.test.tsx` — the editor … offers the URL's own label for a new one   | `addingName` reduced to `typedName ?? ''`                                          | `expect(element).toHaveValue(#4178) · Received:` (nothing after it)                                           |
| `plan-cells.test.tsx` — a name … outlives the URL it was typed beside           | `typedName` initialised to `''` and read as `typedName === '' ? refLabelOf(…) : …` | `expect(element).toHaveValue() · Received: #4178` — **at the cleared-box assertion only**; see the note below |

### Two proofs that were wrong before they were watched

**A negative watched passing.** The last row's test first ended at "typed words survive a new
URL", and that case cannot see the fault: both readings keep non-empty words. Injected, it was
watched **green**. The case the `null` sentinel exists for is a box the reader **emptied on
purpose**, and the test now clears it before changing the URL. Recorded in `AGENTS.md`.

**A claim about which layer refuses a bad field, read off the code rather than measured.**
`plan-command-shapes.ts` declares `'name?': 'string'`, so the first draft of
`asOptionalExternalRefs` said the shape refuses a mistyped name before the parser runs,
demoted the `typeof` to narrowing and collapsed two refusals into one. Probed against
`buildApp`: the shape refuses an unknown **key** (`{"error":"invalid_body"}`) and lets a
mistyped **value** through, so `name: 7` was answered `..._is_too_long` — `(7).length` is
`undefined`, `undefined > 300` is false, the ref is written with a number in its name column
and the tree read then fails its own response schema. Two codes now, both watched, and the
probe's answers are assertions rather than a sentence. Recorded in `AGENTS.md`.

### One check kept although it cannot fail

`e2e/external-refs.spec.ts`'s `the card as a reader sees it` asserts only that the card is
visible; its point is the attached screenshot. It is a picture, not a gate, and it says so.

## What this change does not do

- Saved plans do not capture a ref's name. `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` stays at 1,
  and `saved-plan-input.ts` carries the reasoning at the line that drops the field: a name
  moves no date and no path restores a snapshot over live rows, so nothing can lose one.
- Nothing is fetched. A name is typed; `refLabelOf` reads a URL and no network.
