# Root integration receipt

Commit `b06bf6595` integrated after independent Astra High review approved spec compliance and quality with no findings. Reviewer fresh run:25pass,123assertions; mutation evidence reviewed, not rerun. Normal root commit hooks passed; Tool Wiki inactive/uncertified. Report below predates root commit and records worker staging permission limit.

# Slice 1.1: pure project abbreviation and address grammar

Status: implemented, self-reviewed, ready for parent commit. No commit SHA: staging is blocked by read-only shared Git metadata. Exact failure:

```
fatal: Unable to create '/home/df/wd/puni/puni-00/.git/worktrees/puni-cross-address/index.lock': Read-only file system
```

Only assigned paths changed in `/tmp/puni-cross-address`:

- `libs/wbs/domain/domain/src/project-address.ts`
- `libs/wbs/domain/domain/src/project-address.test.ts`
- `libs/wbs/domain/domain/src/index.ts`

Behavior: manual 1–20-character abbreviations allow ASCII letter first, then ASCII letters/digits/_/-, validating before uppercase to reject Unicode that uppercases into ASCII. Suggestions use deterministic 3/4/5-letter prefixes from ASCII name letters, padding short names with X and using PRJ for names with no ASCII letters. Qualified addresses split at the first dot and retain numeric zeroes and step-reference spellings. Local numeric and step references retain their interpretation. There is no project lookup, allocation, identity binding or stale-selection authority.

Implementation note: step-reference's NUMBER constant is private. The new helper uses its same digit-group shape, with a strict end lookahead (rejecting trailing newline), and delegates all step syntax to `parseStepReference`. No step-reference edits were made. Redundant separate minimum-length and delimiter guards were omitted: initial-letter validation rejects empty prefixes and local-reference validation rejects missing suffixes. Existing local/qualified step inputs ending in LF/CRLF or space were tested and rejected without a fix.

Read evidence: LLM_README, AGENTS, task brief, change design and project-addresses spec, TDD skill and good-tests reference, step-reference implementation/tests and application step-addresses caller. Self-review checked exact interface signatures, owned paths, no IO or identity authority, numeric zero preservation, first-dot semantics, non-ASCII admission, unique suggestions, and proof-comment accuracy.

## RED

Initial test-first run found the not-yet-created module (0 pass, 1 fail, 1 import error). After adding typed inert stubs, the behavioral RED run showed 6 pass / 5 fail, 43 assertions. The five failures were manual acceptance, deterministic recommendations, nonempty valid suggestions, qualified parsing, and local parsing. Exact behavioral output follows:

```
bun test v1.4.2 (744846f84)

libs/wbs/domain/domain/src/project-address.test.ts:
 6 |   suggestProjectAbbreviations,
 7 | } from './project-address';
 8 |
 9 | describe('parseProjectAbbreviation', () => {
10 |   it('accepts one and twenty character manual abbreviations', () => {
11 |     expect(parseProjectAbbreviation('a')).toEqual({ ok: true, abbreviation: 'A' });
                                               ^
error: expect(received).toEqual(expected)

  {
-   "abbreviation": "A",
-   "ok": true,
+   "ok": false,
+   "reason": "invalid_abbreviation",
  }

- Expected  - 2
+ Received  + 2

      at <anonymous> (/tmp/puni-cross-address/libs/wbs/domain/domain/src/project-address.test.ts:11:43)
(fail) parseProjectAbbreviation > accepts one and twenty character manual abbreviations [0.26ms]
(pass) parseProjectAbbreviation > rejects empty and twenty-one character abbreviations [0.06ms]
(pass) parseProjectAbbreviation > rejects leading digits hyphens and underscores [0.02ms]
(pass) parseProjectAbbreviation > rejects dots whitespace and non-ASCII characters before normalization [0.03ms]
47 |   });
48 | });
49 |
50 | describe('suggestProjectAbbreviations', () => {
51 |   it('suggests deterministic name-based prefixes', () => {
52 |     expect(suggestProjectAbbreviations('Puni Core')).toEqual(['PUN', 'PUNI', 'PUNIC']);
                                                          ^
error: expect(received).toEqual(expected)

- [
-   "PUN",
-   "PUNI",
-   "PUNIC",
- ]
+ []

- Expected  - 5
+ Received  + 1

      at <anonymous> (/tmp/puni-cross-address/libs/wbs/domain/domain/src/project-address.test.ts:52:54)
(fail) suggestProjectAbbreviations > suggests deterministic name-based prefixes [0.06ms]
54 |   });
55 |
56 |   it('suggests only three to five ASCII letters', () => {
57 |     for (const name of ['A', 'ab', '', '123_---', 'Проєкт', 'ıſß', 'Püni 2026']) {
58 |       const suggestions = suggestProjectAbbreviations(name);
59 |       expect(suggestions.length).toBeGreaterThan(0);
                                      ^
error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received: 0

      at <anonymous> (/tmp/puni-cross-address/libs/wbs/domain/domain/src/project-address.test.ts:59:34)
(fail) suggestProjectAbbreviations > suggests only three to five ASCII letters [0.14ms]
65 |   });
66 | });
67 |
68 | describe('parseWorkItemAddress', () => {
69 |   it('parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev', () => {
70 |     expect(parseWorkItemAddress('puni-core.080.39')).toEqual({
                                                          ^
error: expect(received).toEqual(expected)

  {
-   "abbreviation": "PUNI-CORE",
-   "kind": "qualified",
-   "reference": "080.39",
+   "kind": "invalid",
  }

- Expected  - 3
+ Received  + 1

      at <anonymous> (/tmp/puni-cross-address/libs/wbs/domain/domain/src/project-address.test.ts:70:54)
(fail) parseWorkItemAddress > parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev [0.06ms]
84 |     });
85 |   });
86 |
87 |   it('keeps numeric numbers and 010.s1-dev local', () => {
88 |     for (const reference of ['010', '080.39', '010.s1-dev', '020.2.review', '020.2.s02-review']) {
89 |       expect(parseWorkItemAddress(reference)).toEqual({ kind: 'local', reference });
                                                   ^
error: expect(received).toEqual(expected)

  {
-   "kind": "local",
-   "reference": "010",
+   "kind": "invalid",
  }

- Expected  - 2
+ Received  + 1

      at <anonymous> (/tmp/puni-cross-address/libs/wbs/domain/domain/src/project-address.test.ts:89:47)
(fail) parseWorkItemAddress > keeps numeric numbers and 010.s1-dev local [0.06ms]
(pass) parseWorkItemAddress > rejects empty qualified endpoints [0.02ms]
(pass) parseWorkItemAddress > rejects malformed project prefixes [0.02ms]
(pass) parseWorkItemAddress > rejects malformed local and qualified references [0.02ms]

 6 pass
 5 fail
 43 expect() calls
Ran 11 tests across 1 file. [21.00ms]

```

## Watched safety negatives

Each mutation was applied independently to the production module, exercised through its exported functions, and restored in `finally`. Each test command exited 1; none survived. Adjacent production Proof comments name the injected defect and failed test. Exact summaries:

```
length: exit 1
(fail) parseProjectAbbreviation > rejects empty and twenty-one character abbreviations [0.28ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.14ms]
 9 pass
 2 fail
initial: exit 1
(fail) parseProjectAbbreviation > rejects empty and twenty-one character abbreviations [0.58ms]
(fail) parseProjectAbbreviation > rejects leading digits hyphens and underscores [0.24ms]
(fail) parseWorkItemAddress > rejects empty qualified endpoints [0.18ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.16ms]
 7 pass
 4 fail
characters: exit 1
(fail) parseProjectAbbreviation > rejects dots whitespace and non-ASCII characters before normalization [0.32ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.11ms]
 9 pass
 2 fail
ascii-normalization: exit 1
(fail) parseProjectAbbreviation > rejects dots whitespace and non-ASCII characters before normalization [0.30ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.14ms]
 9 pass
 2 fail
delimiter: exit 1
(fail) parseWorkItemAddress > parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev [0.36ms]
 10 pass
 1 fail
prefix: exit 1
(fail) parseWorkItemAddress > rejects empty qualified endpoints [0.44ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.17ms]
(fail) parseWorkItemAddress > rejects malformed local and qualified references [0.15ms]
 8 pass
 3 fail
reference: exit 1
(fail) parseWorkItemAddress > rejects empty qualified endpoints [0.35ms]
(fail) parseWorkItemAddress > rejects malformed local and qualified references [0.11ms]
 9 pass
 2 fail
numeric: exit 1
(fail) parseWorkItemAddress > rejects empty qualified endpoints [0.20ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.08ms]
(fail) parseWorkItemAddress > rejects malformed local and qualified references [0.06ms]
 8 pass
 3 fail
step: exit 1
(fail) parseWorkItemAddress > parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev [0.28ms]
(fail) parseWorkItemAddress > rejects empty qualified endpoints [0.08ms]
(fail) parseWorkItemAddress > rejects malformed project prefixes [0.06ms]
(fail) parseWorkItemAddress > rejects malformed local and qualified references [0.06ms]
 7 pass
 4 fail
suggestion-characters: exit 1
(fail) suggestProjectAbbreviations > suggests deterministic name-based prefixes [0.35ms]
(fail) suggestProjectAbbreviations > suggests only three to five ASCII letters [0.25ms]
 9 pass
 2 fail
suggestion-length: exit 1
(fail) suggestProjectAbbreviations > suggests deterministic name-based prefixes [0.33ms]
(fail) suggestProjectAbbreviations > suggests only three to five ASCII letters [0.23ms]
 9 pass
 2 fail

```

Mutation definitions and full individual failing output are retained at `/tmp/puni-address-mutations.py` and `/tmp/puni-address-mutation-<label>.log`. Character/length/prefix/reference admission negatives execute the public parser; delimiter mutation changes first-dot splitting to last-dot splitting. Normalization mutation uppercases before validation and exposes dotless i/long-s/eszett acceptance.

## Final GREEN and checks

`bun test libs/wbs/domain/domain/src/project-address.test.ts libs/wbs/domain/domain/src/step-reference.test.ts`: 25 pass / 0 fail / 123 assertions. Exact final output:

```
bun test v1.4.2 (744846f84)

libs/wbs/domain/domain/src/project-address.test.ts:
(pass) parseProjectAbbreviation > accepts one and twenty character manual abbreviations [0.14ms]
(pass) parseProjectAbbreviation > rejects empty and twenty-one character abbreviations [0.04ms]
(pass) parseProjectAbbreviation > rejects leading digits hyphens and underscores [0.02ms]
(pass) parseProjectAbbreviation > rejects dots whitespace and non-ASCII characters before normalization [0.04ms]
(pass) suggestProjectAbbreviations > suggests deterministic name-based prefixes [0.14ms]
(pass) suggestProjectAbbreviations > suggests only three to five ASCII letters [0.11ms]
(pass) parseWorkItemAddress > parses PUNI-CORE.080.39 and PUNI_CORE.020.s1-dev [0.22ms]
(pass) parseWorkItemAddress > keeps numeric numbers and 010.s1-dev local [0.03ms]
(pass) parseWorkItemAddress > rejects empty qualified endpoints [0.02ms]
(pass) parseWorkItemAddress > rejects malformed project prefixes [0.05ms]
(pass) parseWorkItemAddress > rejects malformed local and qualified references [0.18ms]

libs/wbs/domain/domain/src/step-reference.test.ts:
(pass) formatStepReference > spells the step ordinal before its immutable code [0.03ms]
(pass) parseStepReference > splits at the last dot, because a code holds none [0.03ms]
(pass) parseStepReference > reads the ordinal alias [0.04ms]
(pass) parseStepReference > refuses what is not a reference [0.05ms]
(pass) resolveStepReference > resolves a legacy code-only reference to its step node [0.17ms]
(pass) resolveStepReference > resolves a nested number [0.02ms]
(pass) resolveStepReference > accepts an ordinal reference when position and code agree, and answers canonical spelling [0.02ms]
(pass) resolveStepReference > refuses an alias whose position names another step [0.02ms]
(pass) resolveStepReference > refuses an unknown number, an unknown code and a parent [0.02ms]
(pass) resolveStepReference > refuses a malformed reference
(pass) describeAddressSpace > is the same for the same addresses, whatever order they are listed in [0.09ms]
(pass) describeAddressSpace > changes when a number, a leafhood, a code or a step position changes [0.08ms]
(pass) describeAddressSpace > describes two work items holding one number without refusing the read [0.03ms]
(pass) resolveStepReference over a shared number > refuses a number two work items hold [0.02ms]

 25 pass
 0 fail
 123 expect() calls
Ran 25 tests across 2 files. [23.00ms]

```

Other fresh checks:

- `bunx prettier --check` on all three owned paths: exit 0, all matched files use Prettier code style.
- `bunx eslint` on all three owned paths: exit 0, no output after building the Nx project graph. Initial direct lint warned module-boundary rules were skipped without cached graph; that was resolved with `NX_DAEMON=false bunx nx show project wbs-domain --json` and lint rerun cleanly. Nx reported plugin socket denial and successfully used its documented main-process fallback.
- `bunx tsc --noEmit --project libs/wbs/domain/domain/tsconfig.lib.json`: exit 0, no output.
- `git diff --check`: exit 0.

Skipped by assigned scope: full workspace gates/builds, h2 gate, HTTP admission and storage integration tests, and all later cross-project slices. No claim that the full feature is complete. Normal commit hooks were not bypassed; commit was not attempted after staging failed. Parent must commit with normal hooks.
