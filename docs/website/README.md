# PUNI website

The website introduces Prosperous Unification's software services and turns a visitor's request into a brief for human follow-up. The landing prompt comes first; the blog records real struggles and successes from the AI software factory.

## Repositories

- [puni-00](https://github.com/Prosperous-Unification/puni-00): public projects and the current management tooling.
- [puni-pr-00](https://github.com/Prosperous-Unification/puni-pr-00): private companion, created and verified private on 2026-09-27. A first shared baseline projection and explicit project-transfer command are implemented; see [portability and verified limits](../workspace/portability.md). The complete governance and release setup remains in the implementation roadmap.
- `puni-pr-00/apps/website/site`: destination for the licensed Astro/Novaform website. The existing empty `puni-site` repository is left unchanged.
- `puni-00/apps/website/{fe-01,be-01}` and `puni-00/libs/website/{domain/contracts,adapters/store-sqlite}`: canonical public app, API and shared libraries. The private companion keeps a pinned service snapshot for its local three-host demo; source edits begin here.

[ADR 0032](../adr/0032-public-and-private-monorepos-share-a-portable-project-contract.md) records the private companion decision and the requirement to copy eligible projects, with their local dependencies, between the two monorepos.

## Release order

| Release                  | Visitor outcome                                                     | Required foundations                                                                                                             |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M0: plan and walkthrough | Review the proposed journey                                         | Domain terms, contracts, dependency plan and local demo                                                                          |
| M1: manual funnel        | Read the site/blog, describe a project, request a proposal          | Private workspace baseline, licensed source import, durable manual intake, operator sign-in/inbox, privacy and recovery          |
| M2: AI scoping           | Sign in after the first prompt, clarify the request, review a brief | Cross-host draft claim, account access, OpenRouter adapter, reservations/accounting, policy evaluations and operational controls |
| M3: concept preview      | Explore an illustrative interface and request one revision          | Typed component schema, safe renderer, generation allowance and the same cost controls                                           |

Manual submission does not require a visitor account. The planned [Build AI chat harness](../../openspec/changes/build-ai-chat-harness/proposal.md) supersedes the earlier "choosing AI requires sign-in before any model call" line: the conversation is bound to the browser draft claim under the conversation allowance, and sign-in stays optional (orchestrator assumption, see [ADR 0034](../adr/0034-anonymous-paid-chat-bound-to-the-browser-claim.md)). Proposal submission is always an explicit action, available before using every turn or generating a preview. The AI cannot agree to a price, delivery date or contract.

## Planning and evidence

- [WBS](https://dev.wbs.bulletpoints.club/): select **PUNI platform plan**, project `558ec5c7-f561-4181-9d9b-055b06bc9796`. Existing website `060`, intake `080.12` and deployment `110` carry the work; WBS product `040`/`050` remain separate.
- [Intent](../../openspec/changes/puni-website-funnel/proposal.md), [technical design](../../openspec/changes/puni-website-funnel/design.md), [implementation slices](../../openspec/changes/puni-website-funnel/tasks.md), and [verification](../../openspec/changes/puni-website-funnel/verify.md).
- [WBS work-item mapping](../../openspec/changes/puni-website-funnel/evidence/wbs-mapping.md) and [verified write receipt](../../openspec/changes/puni-website-funnel/evidence/wbs-verification.json).
- [Build app change](../../openspec/changes/assistant-ui-build/proposal.md), [implementation tasks](../../openspec/changes/assistant-ui-build/tasks.md), [verification](../../openspec/changes/assistant-ui-build/verify.md), and [Google/OpenRouter runtime setup](build-runtime.md).
- [Build AI chat harness](../../openspec/changes/build-ai-chat-harness/proposal.md): the planned redesign ([design](../../openspec/changes/build-ai-chat-harness/design.md), [system prompt](../../openspec/changes/build-ai-chat-harness/system-prompt.md), [slices](../../openspec/changes/build-ai-chat-harness/tasks.md)).
- [Build app screen polish](../../openspec/changes/polish-build-app-screens/proposal.md) and its [verification](../../openspec/changes/polish-build-app-screens/verify.md); `apps/website/fe-01/browser/screens.mjs` audits every app state at four widths.
- [Domain language](CONTEXT.md), [OpenRouter research](openrouter-research.md), and [frontend agent libraries](frontend-agent-libraries.md).
- [Anonymous draft retention operator procedure](draft-retention.md) records the explicit inspect/apply command and its backup limitation.
- [Request retention deadlines](request-retention.md) records the count-only report, activation coverage and ambiguous-anchor resolution commands.
- [Interactive local walkthrough](prototypes/funnel.html) and [instructions](prototypes/README.md). Open the HTML file directly; it uses no accounts, network, model or real submission.

The proposed budget values and turn limits live in the design. They are pilot assumptions; this planning work does not activate paid inference or deploy a public funnel.

The ownership promotion is recorded in [OpenSpec](../../openspec/changes/promote-website-services-public/proposal.md). The reviewed import came from private revision `5e5386d`; the private snapshot receipt pins the resulting public revision. The project-transfer command still refuses private-classified source, including the Astro site.
