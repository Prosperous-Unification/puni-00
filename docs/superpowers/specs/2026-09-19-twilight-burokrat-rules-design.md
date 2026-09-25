# Twilight Burokrat rules design

Status: proposed design, 2026-09-19. Nothing here is implemented. It extends the existing
[Twilight Burokrat package](../../../apps/twilight-structure/twilight-burokrat/cli/README.md) from a wiki ledger validator
into the single static judge of every rule in the repository. Names follow
[names and boundaries](../../twilight-structure/names.md). The rules it must judge first come
from the [code organization design](2026-09-19-code-organization-design.md).

## Intent

**Problem.** The repository's rules are judged in many places: a wiki validator, tests inside
the devsync tool, ESLint fences, CI steps, hooks and reviewer memory. An agent cannot ask one
tool whether an artifact is allowed, and a new rule has no obvious home.

**Outcome.** Twilight Burokrat answers one question for any artifact: is this allowed and
complete? It answers from a Git revision, a trusted policy and recorded evidence, with no side
effects. It holds the templates that every generated artifact must match. Twilight Navigator
and Twilight Dash both call it, as a command and as a library.

**Non-goals.** It does not run tests, deploy, generate code, invoke reviewers, hold leases or
call a model. Those take time or change something, so they are Twilight Dash's. It does not
replace OpenSpec, ESLint or the compiler; it judges their inputs and their recorded outputs.

**Constraints.** The existing trust boundary holds: a candidate cannot select the activation
that evaluates it. Version-1 record identifiers, module identifiers, role filenames and the
legacy environment variables keep their spelling. Every rule ships with a production-path
negative proof.

## Principles

1. **A pure judge.** A verdict is a function of the candidate, the trusted policy and the
   evidence. No network, no credentials, no clock. Anyone can rerun it and get the same answer.
2. **Whole tree, always.** Every certifying mode enumerates the whole tree, as the wiki design
   requires, because a staged-path check misses deleted targets and new reverse edges.
3. **Derived over handwritten.** A fact that can be extracted is never declared by hand.
4. **One home per template.** The tool that validates an artifact kind also holds its template.
5. **A rule can fail.** No rule is enabled until its negative has been watched failing.
6. **Debt is visible.** A rule in observe or ratchet mode reports what it does not yet enforce.

## What it judges

| Family         | Judges                                                                                                                                   | State today                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Inventory      | Every tracked entry is enumerated and classified                                                                                         | Exists                                         |
| Modules        | Indexes, membership, identifiers, the module layout of the code organization design                                                      | Indexes exist; layout is new                   |
| Relationships  | Import edges, reverse edges, declared facts; kind direction K2 to K6; table ownership K8                                                 | Extraction exists; the kind rules are new      |
| Documents      | Links, anchors, size caps, glossary format, ADR format, the name-writing rule                                                            | Links and caps live in the devsync tests today |
| Specifications | Intent size, non-vacuous Given, When and Then, coverage classes, scenario identifiers, the capability class, feature to capability links | New; needs an OpenSpec requirement selector    |
| Glossary       | Term format, avoided words used in current documents, resource to term links                                                             | New                                            |
| Tests          | Level by suffix, location inside a module, T1 and T2, report validity, the two coverage ledgers                                          | New                                            |
| Code shape     | F1, F2, F3 and the F7 size ratchet                                                                                                       | New; lint gives the fast copy of F1 and F3     |
| Templates      | An artifact generated from a template still conforms to it                                                                               | New                                            |
| Evidence       | Review provenance, content manifests, currency, policy activation, admission verdicts                                                    | Exists                                         |

## The rule model

Every rule has the same shape, whatever it judges.

```ts
export type RuleMode = 'observe' | 'ratchet' | 'enforce';

export interface Rule {
  /** Stable, short and quoted in messages: `K3`, `F7`, `T2`, `DOC-LINK`. */
  readonly id: string;
  readonly family: string;
  /** One sentence. The same sentence the owning specification states. */
  readonly statement: string;
  /** Where the rule is specified: an OpenSpec requirement or an ADR. */
  readonly source: string;
  /** Selectors the rule reads. A changed selector stales the rule's earlier verdicts. */
  readonly inputs: readonly string[];
}

export interface Finding {
  readonly ruleId: string;
  readonly path: string;
  /** The module, scenario or term the finding is about, when there is one. */
  readonly subject?: string;
  readonly message: string;
  /** `debt` in observe mode and outside a ratchet's adopted set; `refusal` otherwise. */
  readonly effect: 'debt' | 'refusal';
}

export interface Verdict {
  readonly candidate: string;
  readonly policy: string;
  readonly allowed: boolean;
  readonly findings: readonly Finding[];
}
```

The mode of a rule is policy, not code. It lives in the consumer's trusted policy beside an
adopted set and dated exemptions, the way the document check exemptions already carry an
expiry. A candidate can propose a policy change; it cannot be judged by it.

The verdict is the candidate record that Twilight Dash consumes. It adds what Dash needs to
act: affected deployables, migration facts and environment facts, all derived from module
indexes and the extracted relationships.

## Commands

The sixteen existing commands stay, with their arguments unchanged. New commands group by what
a caller wants to know. The short binary name is added by the
[rename plan](../plans/2026-09-19-twilight-rename.md).

| Command                                          | Answers                                                                  | Certifies |
| ------------------------------------------------ | ------------------------------------------------------------------------ | --------- |
| `twib check <selection> <repository> <revision>` | Is this candidate allowed? Every rule, whole tree.                       | Yes       |
| `twib check --rule <id>`                         | The same for one rule or one family                                      | No        |
| `twib quick <paths>`                             | Fast feedback on a few artifacts while writing them                      | Never     |
| `twib explain <rule-id>`                         | The statement, its source, its mode, its last negative proof             | No        |
| `twib candidate <revision>`                      | The candidate record for Twilight Dash                                   | Yes       |
| `twib module show <id>`                          | Purpose, exports, requirements, consumers, checks                        | No        |
| `twib module tests <id> --level <level>`         | The test files of a module at a level, for Dash to run                   | No        |
| `twib scenario allocate <capability>`            | New identifiers for scenarios that lack one, with predecessors preserved | No        |
| `twib coverage scenarios <reports>`              | The scenario coverage ledger                                             | Yes       |
| `twib coverage structure`                        | The structural coverage ledger                                           | Yes       |
| `twib report validate <file>`                    | Is this report well-formed and bound to a real candidate or observation? | Yes       |
| `twib template list`, `show`, `verify`           | Which templates exist, what one contains, whether an artifact matches    | Verify    |

A quick verdict never certifies. It says so in its output and its record, because it does not
enumerate the tree. It exists so Twilight Navigator and Twilight Dash can validate an artifact
in a fast loop before paying for the full check.

Every command is also a library operation with the same inputs and the same record as output.
Twilight Navigator and Twilight Dash call the library in process; CI and people call the
binary. The backend and CI of the control plane calling the same operations is already a
requirement of the control-plane design.

## Templates

| Template         | Generates                                                       | Conformance rule                         |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------- |
| Module, backend  | README with index, contract, module, check, isolated type check | Module layout                            |
| Module, frontend | The same plus a view directory                                  | Module layout, F1, F3                    |
| Feature-service  | One service file with its capability link                       | K1, K3, K9                               |
| Resource-service | One service file with its glossary term link                    | K1, K4, K9                               |
| Repository       | A port and an adapter with a conformance test                   | K5, required test levels                 |
| Capability       | A specification with purpose, class and owning tool             | Specifications family                    |
| Scenario         | Given, When and Then with an allocated identifier               | Non-vacuous clauses                      |
| Manual procedure | The scenario link, the reason it cannot be automated, the steps | Manual disposition is reviewed and dated |
| ADR              | The repository's ADR format                                     | Documents family                         |
| Change packet    | Intent, delta specs, design, tasks and verification record      | Intent size, artifact readiness          |

The package ships default templates. A consumer's policy pins the template version it uses and
may override a template, so a client repository can differ without forking the tool. Twilight
Dash instantiates a template; Twilight Burokrat verifies the result. Because both read the
same template, a generator and its validator cannot drift.

## Gates along the work request flow

Twilight Navigator and Twilight Dash move the work. Twilight Burokrat gates each stage's
artifacts. Stage names are those of the [Twilight SDLC](../../twilight-structure/sdlc-stages.md).

| Stage                        | Artifacts judged                                  | Families                                      |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Request, discovery           | Intent, assumptions, new glossary terms           | Specifications, glossary                      |
| Specification                | Capability specs, scenarios, design, ADRs         | Specifications, documents                     |
| Planning                     | Tasks, module plan, required test levels          | Modules, tests                                |
| Implementation, knowledge    | Source, module indexes, documents                 | Relationships, code shape, modules, documents |
| Review, verification         | Review provenance, verification record, reports   | Evidence, tests                               |
| Integration through coverage | The combined candidate, reports, both ledgers     | Every family, certifying                      |
| Publication, release         | The candidate record and its environment bindings | Evidence                                      |

## Checks that move in

| Check today                                     | Lives in                         | Becomes                                                          |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Links, anchors, named Nx projects, legacy roots | The devsync namespacing test     | Documents family                                                 |
| Document size caps                              | The devsync tests and rule R1    | Documents family                                                 |
| Ring and boundary fences                        | ESLint and the boundary tests    | Relationships family; lint stays as the fast copy                |
| Migration pairs and additive migrations         | A CI step                        | Relationships family, from the migration facts already extracted |
| The service kind inventory and the size ratchet | New devsync tests, temporary     | Relationships and code shape families                            |
| OpenSpec structure                              | The OpenSpec command in the gate | Read as recorded output; Burokrat adds what it cannot express    |

The secrets scan, the compiler, the test runners and the builds stay where they are. They are
either dynamic or already a single authority.

## What moves out

Three parts of today's package take time or change something, so by the static and dynamic
split they belong to Twilight Dash. Each move is its own OpenSpec change, made after the
package is published and adopted, and none is started by this design.

| Part                                              | Why it is dynamic                                     |
| ------------------------------------------------- | ----------------------------------------------------- |
| Lease claims, generations and the authority store | Runtime state with heartbeats and fencing             |
| The review invoker                                | It starts reviewer sessions                           |
| The experiment runner                             | It runs trials; accounting and export validation stay |

The admission verdict, review provenance validation and the exhaustive coverage evaluation are
static judgments and stay.

## Delivery slices

| Slice | Delivers                                                                             | Depends on                       |
| ----- | ------------------------------------------------------------------------------------ | -------------------------------- |
| B0    | The rule model, the verdict record, `check` and `explain` over the existing families | Nothing                          |
| B1    | The documents family, moved from the devsync tests with their proofs                 | B0                               |
| B2    | Kind direction, table ownership, the size ratchet, module layout                     | B0; rollout Tasks 2 to 4         |
| B3    | The OpenSpec requirement selector, scenario identifiers, the specifications family   | B0; rollout Task 1               |
| B4    | Report validation and the two coverage ledgers; T2 becomes enforceable               | B3; rollout Task 5               |
| B5    | The template registry, `template verify`, the first four templates                   | B2                               |
| B6    | The shared contracts library and the candidate record for Twilight Dash              | B0                               |
| B7    | The three moves out                                                                  | Package publication and adoption |

Each slice is an OpenSpec change with intent, delta specs, ordered test-first tasks and a
verification record. B0 comes first because every later slice adds rules to its model.

## Open items

Found while planning slice B0 on 2026-09-19:

- **No existing check types its violations.** The index check, the classification and the relationship extraction all throw a plain error for a candidate violation and for an infrastructure failure alike, so no adapter can tell them apart. B0 therefore takes findings only from a check's structured output and treats every throw as not evaluated, which disallows the verdict in every mode. The consequence: in B0 only the direct-entries rule and the relationship rule can report debt; the index rule and the classification rule either pass or are not evaluated. Teaching those check functions to return violations as data is the first task of slice B1, because the principle that debt is visible is only partly met until then.
- **Relationship extraction needs an Nx workspace file in the candidate.** A fixture repository for a rules test must carry `nx.json` and `package.json`.
- **The existing checks throw; they do not return findings.** The rule model in B0 is therefore a disposition layer over adapters that catch, and a wrapped refusal has no path or subject. A family that needs per-path findings must change its check functions.
- **Ratchet mode needs an adopted set, which B0 does not have.** B0's policy loader refuses `ratchet` by name and points at slice B2, instead of treating it as observe or enforce.
- **Every slice that adds a source file changes the validator identity** that a provisioned activation binds, so the activation must be prepared again after each one.
- **`explain` cannot show a rule's last negative proof in B0.** There is no proof register before slice B4. B0's `explain` prints the statement, the source and the mode; the last proof is deferred to B4 and the first change says so in a requirement.
- **A failure to evaluate is not a violation.** B0 distinguishes a rule that observed the candidate from a rule that could not be evaluated, for example because an input was missing or a tool could not run. An unevaluated rule makes the verdict disallowed in every mode, observe included.
- **`check` sits beside the two lint commands in B0.** Those commands need a trusted binding, check receipts, an audit and lint evidence, and they emit a certification record. A B0 verdict carries `certifies: false` and reuses the same check functions and the same trust boundary.

Earlier items:

1. Whether a rule's fast lint copy and its authoritative graph check are generated from one
   declaration, so they cannot disagree.
2. How a consumer overrides a template without losing upgrades to the default.
3. Whether the quick mode needs a cache, and what proof shows the cache cannot certify.
4. The name and location of the shared contracts library are proposed in the rename plan and
   settled when slice B6 starts.
