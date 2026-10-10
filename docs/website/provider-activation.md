# OpenRouter provider candidate for Build

Checked 2026-09-29 against public first-party catalogs and the current API source. This is a configuration candidate, not live provider certification. [Build runtime setup](build-runtime.md) owns the preview activation and disable sequence.

## Recommendation

Start with **`openai/gpt-4.1-mini` on the exact `azure/swedencentral` endpoint**, subject to the gates below. OpenRouter's [GPT-4.1 Mini page](https://openrouter.ai/openai/gpt-4.1-mini) lists it as a text-output model and shows Azure serving it. The [live ZDR endpoint catalog](https://openrouter.ai/api/v1/endpoints/zdr) listed `azure/swedencentral` for this model on 2026-09-29, at **$0.44 per million prompt tokens and $1.76 per million completion tokens**; its declared maximum completion was above PUNI's 1,024-token cap. The catalog also listed a cheaper `azure` endpoint at $0.40/$1.60. Pinning the full regional slug avoids treating the `azure` base slug as an exact endpoint: OpenRouter says a [base slug matches its regional variants](https://openrouter.ai/docs/guides/routing/provider-selection#targeting-specific-provider-endpoints). This endpoint name alone does not establish EU data residency; OpenRouter describes [in-region routing as a separate enterprise feature](https://openrouter.ai/docs/guides/routing/provider-selection).

The [OpenAI GPT-4.1 family guide](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-4.1) describes the family as low-latency models without an internal reasoning step. That suits short scoping replies under PUNI's 30-second abort better than a default-reasoning model. [GPT-5 Mini](https://openrouter.ai/openai/gpt-5-mini) lists $0.25/$2.00 per million tokens and reasoning behavior; the [newer GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna) lists $0.10/$0.50, but [OpenAI says it defaults to medium reasoning](https://developers.openai.com/api/docs/guides/reasoning). Their lower input prices do not establish better completion time or usable visible output within PUNI's 1,024-token and 30-second limits. GPT-4.1 Mini is the conservative first paid candidate; compare quality and latency later with representative PUNI prompts.

## Recheck on 2026-10-05

The live ZDR catalog still listed `openai/gpt-4.1-mini` on `azure/swedencentral` at $0.44/$1.76 per million tokens with `max_completion_tokens`, `response_format` and `structured_outputs` and no reasoning parameters. Cheaper ZDR endpoints seen the same day: `openai/gpt-4.1-nano` `azure/swedencentral` ($0.11/$0.44, no reasoning; the named fallback), `openai/gpt-5-nano` `azure/swedencentral` ($0.055/$0.44) and `openai/gpt-6-luna` `azure` ($0.10/$0.50), both with default reasoning, and `google/gemini-2.5-flash-lite` `google-vertex/eu` ($0.10/$0.40, reasoning parameters present). The [Build AI chat harness](../../openspec/changes/build-ai-chat-harness/design.md) keeps GPT-4.1 Mini and lowers the completion cap to 400 tokens for its short replies. GPT-4.1 Nano on the same endpoint is the first fallback if the evaluation corpus finds Mini's quality unnecessary; the reasoning-by-default models stay out because hidden reasoning spends completion tokens the 400-token cap and the reserved-ceiling settlement would have to absorb. Changing the endpoint requires changing the privacy page's processor wording first. The [anonymous conversation activation](build-runtime.md#anonymous-conversation-activation) re-reads these rates on the day.

## GPT-6 Luna on `azure/eu` (2026-10-06)

Dany enabled `openai/gpt-6-luna` for the anonymous Build chat. The OpenRouter ZDR catalog read on 2026-10-06 lists its `azure/eu` endpoint at **$0.11 per million prompt tokens and $0.55 per million completion tokens**, with supported parameters `include_reasoning`, `max_completion_tokens`, `reasoning`, `reasoning_effort`, `response_format`, `seed`, `structured_outputs`, `tool_choice`, `tools` and `verbosity`. Reasoning tokens bill as completion tokens and count against `max_completion_tokens`. A probe through OpenAI direct with no reasoning parameter returned 0 reasoning tokens for a trivial prompt; that does not bound reasoning on real prompts, so the effort is set explicitly.

Two validated runtime settings support it; any other value stops the API at startup:

| Setting                            | Allowed                                              | Effect                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_REASONING_EFFORT`      | unset (or empty), `none`, `minimal`, `low`, `medium` | When set, every paid request sends `reasoning: { effort, exclude: true }`, so reasoning text is never returned or stored. Unset sends no `reasoning` field.                                   |
| `OPENROUTER_MAX_COMPLETION_TOKENS` | unset (or empty, meaning 400), integers 100–2000     | The anonymous conversation's `max_completion_tokens` and the output term of each reservation, so the per-conversation, per-source and site ceilings count the worst case including reasoning. |

Settlement charges the provider's `completion_tokens`, which already include `completion_tokens_details.reasoning_tokens`; it does not read OpenRouter's `usage.cost`.

`require_parameters: true` stays on. Setting an effort for an endpoint that does not list `reasoning` (GPT-4.1 Mini on `azure/swedencentral`) filters that endpoint out and every call fails; that is an operator configuration error, so leave the effort unset for non-reasoning models.

Activation values for Luna:

```dotenv
OPENROUTER_MODEL=openai/gpt-6-luna
OPENROUTER_PROVIDER=azure/eu
OPENROUTER_INPUT_USD_PER_MILLION=0.11
OPENROUTER_OUTPUT_USD_PER_MILLION=0.55
OPENROUTER_REASONING_EFFORT=low
OPENROUTER_MAX_COMPLETION_TOKENS=700
```

Low effort keeps replies inside the 30-second deadline; 700 tokens leaves room for a short visible reply beside low reasoning. A reply that runs out of cap finishes with `length` and is stored as truncated.

**Guardrail.** Dany's key guardrail currently allows Luna only via OpenAI direct, which is not a ZDR endpoint; with `zdr: true` and `only: ["azure/eu"]` every call would be refused. Allowing the Azure endpoint in the guardrail keeps zero data retention. Before the enable override, the privacy page must name the Azure EU host instead of Sweden Central, and the activation smoke must confirm a real response's provider identity, final usage including reasoning tokens, and the debit.

**First real evaluation (2026-10-06).** The `eval-20261007-luna` run (effort `low`, cap 700) failed on three causes, each fixed in code: the model repeated the v2 prompt's "how PUNI works" sentence (prompt `puni-sales-v3` now gives facts to paraphrase), `noDate` flagged "the day's bookings" (it now looks for date and delivery commitments only), and Azure refused three scripts, once as a `content_filter` finish and once as a 200-stream error typed `refusal` with `provider_code: cyber_policy`. Refusals now complete as a fixed server-owned decline settled at the reported usage and recorded in `conversation_operation.refusal` (migration `008_refusal`); see [Provider refusals](../../openspec/changes/build-ai-chat-harness/design.md#provider-refusals-2026-10-06). Rerun the corpus with the real key before the enable override.

## Proposed nonsecret preview settings

```dotenv
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_PROVIDER=azure/swedencentral
OPENROUTER_INPUT_USD_PER_MILLION=0.44
OPENROUTER_OUTPUT_USD_PER_MILLION=1.76
OPENROUTER_PRIVACY_VERIFIED=0
OPENROUTER_ENABLED=0
```

Keep `OPENROUTER_API_KEY` unset until a dedicated capped key is provisioned in the protected runtime file. These rates are the endpoint's **public listed rates**, not a quote or a verified debit for PUNI's key. Re-read the endpoint catalog immediately before activation and update both configured rates if they change. The server's [reservation and settlement code](../../apps/website/be-01/src/server.ts) uses these configured rates; it does not discover prices at request time. The [preview Compose configuration and activation procedure](build-runtime.md) explicitly keep `OPENROUTER_ENABLED=0` even if the runtime env file contains `1`; the reviewed enable override is a separate activation step.

## Required checks before enabling

1. **Routing and privacy.** The public ZDR catalog shows an eligible endpoint, but it does not prove this account's key may use it or that the intersection with `data_collection: "deny"` is nonempty. OpenRouter says [`zdr` and `data_collection` apply separate routing filters](https://openrouter.ai/docs/guides/routing/provider-selection#requiring-providers-to-comply-with-data-policies). Check the actual key's privacy settings and a real response's provider identifier. Leave `OPENROUTER_PRIVACY_VERIFIED=0` until that is recorded. ZDR governs provider retention; it does not replace PUNI's own data retention and consent controls.
2. **No fallback, required parameters and rate ceilings.** The source now sends `only`, `zdr`, `data_collection`, `allow_fallbacks: false`, `require_parameters: true`, and `max_price` with the configured prompt/completion rates and `request: 0` on both paid paths. Mounted-route tests inspect the outbound JSON from the direct fetch and installed AI SDK transport. Removing each routing flag or price object independently makes its path's test fail. This implements OpenRouter's [explicit routing and price filters](https://openrouter.ai/docs/guides/routing/provider-selection), but does not prove that the deployed account can reach the intersection of those filters. The installed OpenRouter AI SDK maps `maxOutputTokens` to `max_tokens`, which the pinned Azure endpoint does not list (re-read 2026-10-06), so both paths send the cap only as `max_completion_tokens` and never pass `maxOutputTokens`; mounted tests assert `max_tokens` is absent. Public metadata alone cannot prove the exact wire request passes `require_parameters: true`; verify with the real key before enabling.
3. **Time and accounting.** The model page's aggregate latency/throughput is not a 30-second guarantee for the pinned endpoint. With a capped key, run a bounded smoke through PUNI's server and verify a complete streamed reply, final raw usage, actual account debit, durable reply, duplicate-key replay without a second charge, timeout/cancel reservation handling, and provider identity. The [OpenRouter endpoint API](https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints) provides current metadata, but catalog access is not proof of live eligibility or billing.

No paid request or credentialed eligibility check was made for this research. Until these checks pass, keep both activation flags at `0` and the visible unavailable state in place.
