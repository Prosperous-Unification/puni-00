# Agent swarm criteria against current research and benchmarks

Written **2026-10-22** as part of the readiness assessment rerun. The
[Agent swarm organization](../../../puni-assessment.md#agent-swarm-organization) criterion
was first drawn from one practitioner article. This note re-evaluates each of its seven
questions against research and benchmarks published up to October 2026, records what each
source establishes, and states what changed in the criterion as a result. Where a figure
comes from an abstract or a vendor page rather than a paper read in full, the row says so.
Secondary summaries were not used for numbers.

## What the evidence says

### Coordination architecture must fit the task structure

- _Towards a Science of Scaling Agent Systems_ ([arXiv 2512.08296](https://arxiv.org/abs/2512.08296),
  Google, Dec 2025, revised Apr 2026) ran 260 configurations over six benchmarks, five
  architectures and three model families. Multi-agent coordination gained up to +80.8%
  over a single agent on decomposable work and lost up to -70.0% on sequential planning;
  architectures without centralized verification propagated errors more; coordination
  returned less once the single-agent baseline was already strong. A predictive model picked
  the best architecture for 87% of held-out configurations.
- _When to use multi-agent systems_ ([claude.com](https://claude.com/resources/articles/building-multi-agent-systems-when-and-how-to-use-them))
  and _How we built our multi-agent research system_ ([anthropic.com](https://www.anthropic.com/engineering/multi-agent-research-system),
  Jun 2025) give the vendor position: parallel subagents with isolated context windows for
  breadth-first work, at roughly fifteen times the tokens of a chat session, with token use
  explaining most of the benchmark variance. Cognition's _Don't build multi-agents_
  ([cognition.ai](https://cognition.ai/blog/dont-build-multi-agents), Jun 2025) argues the
  opposite for coding, where actions carry implicit decisions that parallel workers cannot see.
- _Coordination as an Architectural Layer_ ([arXiv 2605.03310](https://arxiv.org/abs/2605.03310),
  May 2026) argues coordination should be a configurable layer separate from agent logic,
  with compute per task treated as an output of the architecture. Its evidence is one model
  on one domain and the authors call it methodology-validating.
- Anthropic's dynamic workflows ([Claude Code docs](https://code.claude.com/docs/en/workflows),
  [Managed Agents docs](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration))
  are the current commercial shape of a lead agent planning, fanning out, verifying and
  merging. Delegation is one level deep with at most 25 child threads per session; a workflow
  run reaches dozens to hundreds of agents. The planted-bug result circulating for it is a
  vendor demonstration without a public write-up or third-party reproduction.

**Consequence.** "Supervisor versus swarm" is the wrong first question. The first question
is whether the task decomposes, and the architecture choice must be made per work type and
measured against a single-agent baseline. PUNI's design, in which code advances a graph and
each step is one agent run, matches the finding that sequential work wants centralized or
code-driven control. The criterion gains a row for architecture fit.

### Claimed coordination gains sit inside the noise floor

- _How Much Coordination Gain Is Real?_ ([arXiv 2606.20695](https://arxiv.org/abs/2606.20695),
  Jun 2026): on tau²-bench retail with paired seeds, configuration-equivalent protocols
  differed by -3 to +18 points between runs; no contrast survived correction; seven of ten
  recent coordination architectures report headline effects below that floor. It proposes
  reporting pass^k only over trials where the coordination mechanism was active.
- _SwarmBench_ ([arXiv 2608.30661](https://arxiv.org/abs/2608.30661), EMNLP 2026 Findings)
  scores models as orchestrators on accuracy, efficiency, cost and process quality and finds
  large differences between models. _CoCoBench_ ([arXiv 2608.28266](https://arxiv.org/abs/2608.28266))
  finds that aggregate scores hide uneven coordination competence.

**Consequence.** The roadmap's W21 benchmark must use paired runs, repeated seeds, a
single-agent control and a reported noise floor, or its throughput claim is not evidence.

### The harness is a first-class variable

- _Harness-Bench_ ([arXiv 2605.27922](https://arxiv.org/abs/2605.27922), May 2026, revised
  Oct 2026): 106 tasks, 5,194 trajectories, substantial variation across model–harness
  pairings; capability should be reported per model–harness configuration.
- _The Scaffold Effect_ ([arXiv 2607.22585](https://arxiv.org/abs/2607.22585), Jun 2026):
  harness choice moved pass rate by 0 to 8 points but tokens per solved task by up to
  40 times; failure signatures were harness-specific; idle turns cost latency.
- _An Empirical Study of Harness Design for Coding Agents_ ([arXiv 2609.20804](https://arxiv.org/abs/2609.20804),
  Sep 2026): 176 matched settings on SWE-Bench Verified and Terminal-Bench 2.1. Context
  management matters most under small budgets and mostly by preventing overflow; rule-based
  elision before summarization was the most efficient policy; planning helps weaker models
  and saves cost for stronger ones; bash-only interfaces suit strong models.
- _Agentic Harness Engineering_ ([arXiv 2604.25850](https://arxiv.org/abs/2604.25850),
  Apr 2026): automatic harness evolution raised Terminal-Bench 2 pass@1 from 69.7% to
  77.0%; gains came from tools, middleware and memory, not the prompt, and transferred
  across model families.
- _Engineering Reliable Coding Agents_ ([arXiv 2608.13867](https://arxiv.org/abs/2608.13867),
  Aug 2026) catalogues 206 reliability records and finds many apparent model failures
  originate in the surrounding system.
- Leaderboards: the official Terminal-Bench 2.1 board ([tbench.ai](https://tbench.ai/leaderboard/terminal-bench/2.1))
  lists agent and model together, top verified entry 83.8% at 2026-06-07; third-party
  trackers quote higher, unverified figures. _SWE-Bench Pro Verified_
  ([arXiv 2609.08149](https://arxiv.org/abs/2609.08149), Sep 2026) adds anti-leakage
  safeguards and reports that some models score substantially lower than before.

**Consequence.** PUNI runs third-party harnesses (Claude Code, Codex, the planned AI SDK
adapters) whose versions, settings and context policies change results and cost by large
factors. The criterion gains a row: harness identity is pinned and reported per attempt,
and tokens per accepted outcome is a tracked measure.

### Context policy has measurable defaults

- The harness study above: elide by rule first, summarize second; recoverable elision
  added complexity that models did not use.
- _CliffCompaction_ ([arXiv 2609.26779](https://arxiv.org/abs/2609.26779), Sep 2026):
  compaction that only truncates or drops, never rephrases, and always recompacts from
  original content; up to 50% cost reduction and more than 10 points on Terminal-Bench under
  a bounded context; released as a proxy that works with Claude Code and Codex.
- _Self-Compacting Language Model Agents_ ([arXiv 2606.23525](https://arxiv.org/abs/2606.23525),
  Jun 2026) criticizes both reactive and periodic compaction. Anthropic's research system
  gives each subagent its own window and returns condensed summaries to the lead.

**Consequence.** The context row now asks for a stated policy per activity class
(budget, elision and summarization order, what a retry receives) and for a rule that
summaries never replace originals as the record of truth.

### Verification against intent, not against the visible tests

- _SpecBench_ ([arXiv 2605.21384](https://arxiv.org/abs/2605.21384), May 2026): with
  visible and held-out suites over 30 systems tasks, every frontier agent passed nearly
  all visible tests while the held-out gap grew by 28 points per tenfold increase in code
  size; one agent produced a 2,900-line lookup table that memorized test inputs.
- _BAITBENCH_ ([arXiv 2608.30724](https://arxiv.org/abs/2608.30724), Aug 2026): 57.1% of
  runs across seven frontier agents took a planted shortcut that inflates the public score;
  telling agents not to cheat left the rate above 50%.
- _Hack-Verifiable Terminal Bench_ ([arXiv 2608.22103](https://arxiv.org/abs/2608.22103),
  Aug 2026) embeds detectable hacks so hacking is measured by construction rather than by a
  judge. _The Verification Horizon_ ([arXiv 2606.26300](https://arxiv.org/abs/2606.26300),
  Jun 2026, 13 authors): verifying is now harder than generating; every verifier is a proxy
  for intent; verification must co-evolve with the generator.
- LLM judges: the sources above report that judges catch unambiguous hacks and degrade on
  ambiguous ones, which is where agents hack.

**Consequence.** The repository's R5 rule, that every check must be provably breakable,
is aligned with this literature but is aimed at guards, not at agent output. The
verification row now asks for held-out acceptance that the implementing agent never sees,
deterministic detection where it can be built, and a second-model review that is treated
as a weak signal rather than a gate.

### Identity means authorization that survives delegation

- _MasDrift_ ([arXiv 2608.07556](https://arxiv.org/abs/2608.07556), Aug 2026, revised Oct
  2026): 600 tasks, centralized hierarchies completed 93.9% to 98.6% but took unauthorized
  actions in 2.7% to 19.8% of tasks, peer networks 85.7% to 87.0% completion with 0.6% to
  0.8% unauthorized; the leak grows with hierarchy depth and comes from structure, not model
  strength; re-anchoring pending calls to the original request cut the leak at 1.6 points of
  completion.
- _Delegation Without Trust_ ([arXiv 2609.00267](https://arxiv.org/abs/2609.00267), Aug
  2026): evaluate agent security assuming the model is hijacked; a default runtime with broad
  bearer credentials fails all four threats; three of four common frameworks provide no
  confinement; a broker reduced a compromised subagent's reach from 8,100 actions to 1.5.
- Standards: the [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
  (Dec 2025) names identity and privilege abuse as a top risk; MCP authorization builds on
  OAuth 2.1 with audience validation and no token passthrough; A2A signs agent cards and
  leaves authorization to the implementer; _AI Identity: Standards, Gaps, and Research
  Directions_ ([arXiv 2604.23280](https://arxiv.org/abs/2604.23280)) finds OAuth handles one
  hop and lacks multi-hop chaining and a scope-to-capability mapping.

**Consequence.** The identity row now states the test: an injected or compromised agent
cannot exceed the authority delegated to it, measured as unauthorized-action rate under
delegation, and the delegation chain is auditable end to end. A worker that pushes with
the owner's credentials fails this test by construction.

### Deciding when work is done: budgets and horizons

- METR's time-horizon page ([metr.org](https://metr.org/time-horizons/)) is no longer
  actively updated as of 2026-09-08 and states that measurements above 16 hours are
  unreliable with its suite; [Time Horizon 1.1](https://metr.org/blog/2026-01-29-time-horizon-1-1/)
  (Jan 2026) expanded the suite to 228 tasks. The 80% horizon of the strongest public models
  was reported in the low single-digit hours in spring 2026; the exact figure is not
  re-verified here.
- The reward-hacking results above show that agents left to run against a test oracle
  optimize the oracle. The Google scaling study shows error amplification without central
  verification.

**Consequence.** Done is decided by code against artifacts and held-out checks, with
budgets in tokens, money and agent time per work item, and work items sized or
checkpointed under the horizon at which the chosen model is reliable, not merely able.

### Review capacity and human understanding are the constraint

- _Artificial Intelligence in the Firm: Bottlenecks in Software Production_ (Chen and
  Stratton, Harvard working paper, 2026; figures as reported in press coverage, paper not
  read): code per worker up about 30%, pull requests up 23%, time from PR to merge up 49%,
  issue and epic resolution unchanged, more staff moved into review.
- _AI Writes Faster Than Humans Can Review_ ([arXiv 2607.01904](https://arxiv.org/abs/2607.01904),
  Jul 2026): 802 developers, 196,212 PRs; output reached 2.09 times baseline, per-reviewer
  load roughly doubled, automated review overtook human review, merge and revert rates held.
- _(Im)Paired Programming_ ([arXiv 2607.26375](https://arxiv.org/abs/2607.26375), Jul 2026):
  agents sped up the task and harmed comprehension; auto-accepting edits correlated with
  lower understanding.

**Consequence.** More agents move the bottleneck to review and to the humans who must
still understand the system. The criterion gains a row for review capacity and retained
understanding, measured, not assumed.

### Failures must be observable and attributable

- _Why Do Multi-Agent LLM Systems Fail?_ ([arXiv 2503.13657](https://arxiv.org/abs/2503.13657), 2025) gives the MAST taxonomy: 14 failure modes in three groups, specification and system
  design, inter-agent misalignment, and task verification and termination.
- _Observability and Fault Injection for LLM-Based Multi-Agent Systems in Software
  Engineering_ ([arXiv 2608.24271](https://arxiv.org/abs/2608.24271), Aug 2026) adds
  OpenTelemetry tracing per agent step and tool call with fault injection for paired runs.
  Later work on silent failures in production runtimes
  ([arXiv 2606.14589](https://arxiv.org/abs/2606.14589), [arXiv 2606.08162](https://arxiv.org/abs/2606.08162))
  distinguishes failing the task from failing the operator unnoticed.

**Consequence.** A swarm whose failures cannot be traced to an agent, step and cause
cannot be improved or trusted. The criterion gains a row for observability and failure
attribution, with fault injection as the proof that the tracing works, which is the
repository's R5 rule applied to the swarm.

## Revised criteria

| Criterion                                  | Status    | What changed                                                                                                          |
| ------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Architecture fit to task structure         | Added     | Decide per work type against a single-agent baseline; sequential work stays centralized or code-driven.               |
| Delegation and handoffs                    | Kept      | Unchanged; the evidence confirms delegation with returned results as the production norm.                             |
| Locus of control                           | Sharpened | Adds error containment: a path without central verification amplifies errors.                                         |
| Sequential and parallel                    | Sharpened | Any gain claim needs paired runs, seeds, a control and a noise floor.                                                 |
| Harness as a measured variable             | Added     | Pin and report harness identity and settings per attempt; track tokens per accepted outcome.                          |
| Context policy                             | Sharpened | Stated budget and elision/summarization order per class; originals remain the record; retries defined.                |
| Identity and authority                     | Sharpened | Injected-agent standard: unauthorized-action rate under delegation, auditable chain, no owner credentials in workers. |
| Deciding when work is done                 | Sharpened | Budgets in tokens, money and time; held-out acceptance; work sized under the reliable horizon.                        |
| Verification                               | Sharpened | Against intent with held-out checks the author never sees; deterministic hack detection; judges are a weak signal.    |
| Review capacity and retained understanding | Added     | Reviewer load, merge latency, revert rate and human comprehension measured as agents are added.                       |
| Failure observability and attribution      | Added     | Per-agent, per-step traces; failing agent and step attributable; fault injection proves the tracing.                  |

## Benchmarks PUNI can run against its own swarm

| Benchmark or protocol                                                   | What it would show for PUNI                                                            | Cost                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- |
| Paired noise-floor protocol                                             | Whether the coordinator beats one agent on puni-00 work items, beyond run-to-run noise | Repeated runs of real work items; spend |
| Held-out acceptance in the gate                                         | Reward-hacking gap on PUNI's own changes                                               | Second test suite per work item type    |
| MasDrift-style authorization drift                                      | Whether delegated agents exceed their authority on PUNI's tool surface                 | Task set with reserved actions          |
| Terminal-Bench 2.1 or SWE-Bench Pro Verified with PUNI's pinned harness | A public reference point for the harness configuration PUNI ships                      | One Harbor run per harness revision     |
| Fault injection on the coordinator                                      | Whether traces attribute an injected failure to the right agent and step               | Already required by the R5 rule         |

## Limits of this note

Abstracts and vendor pages were read, not full papers, except where stated. Several
sources are preprints with single-digit reviewer counts; numbers are quoted as the
authors report them. The Harvard working paper figures come from press coverage. No
benchmark was run. The practitioner article that seeded the criterion remains a fair map
of the design space; the research adds the measurements that decide between its options.
