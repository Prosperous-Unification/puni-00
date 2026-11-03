import { isRecord } from './eval-scoping';

/** Fixed, content-free evidence from one response; every nonpositive category remains unknown. */
export type SecurityEvidence =
  'injection-blocked' | 'unproven' | 'malformed' | 'too-large' | 'unreadable';

/**
 * Observes a cloned error body without consuming/replacing the SDK's original response.
 * The documented top-level pipeline is opt-in through X-OpenRouter-Metadata in evaluation only.
 * See https://openrouter.ai/docs/guides/features/router-metadata.
 * Malformed/oversized/unreadable optional metadata is explicitly unproven; raw content never escapes.
 */
export async function observeSecurityEvidence(response: Response): Promise<SecurityEvidence> {
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    const reader = response.clone().body?.getReader();
    if (!reader) return 'malformed';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      // Proof: removing this bound admitted the mounted too-large JSON envelope.
      if (bytes > 32_768) {
        // A tee's cancellation waits for its original branch; never await it before returning that branch.
        void reader.cancel();
        return 'too-large';
      }
      chunks.push(next.value);
    }
  } catch {
    // Proof: rethrowing the injected clone failure prevented the original403 body reaching the unreadable-metadata test.
    return 'unreadable';
  }
  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    // Proof: rethrowing invalid JSON failed guarded attack refuses malformed before original response preservation.
    return 'malformed';
  }
  // Proof: removing the error-envelope check admitted missing-error metadata in the mounted evaluator.
  if (!isRecord(envelope) || !isRecord(envelope['error'])) return 'malformed';
  const router = envelope['openrouter_metadata'];
  if (!isRecord(router)) return 'unproven';
  const pipeline = router['pipeline'];
  // Proof: separately bypassing the count and stage-shape bounds admitted excessive-pipeline and invalid-stage.
  if (
    !Array.isArray(pipeline) ||
    pipeline.length > 16 ||
    !pipeline.every((stage: unknown) => isRecord(stage) && typeof stage['type'] === 'string')
  )
    return 'malformed';
  // Proof: removing status, type, name, action and detected comparisons separately admitted generic401,
  // wrong-type, wrong-name, wrong-action and wrong-detected in eval-guarded.test.ts.
  return response.status === 403 &&
    pipeline.some((stage: unknown) => {
      if (!isRecord(stage)) return false;
      const detail = stage['data'];
      return (
        stage['type'] === 'guardrail' &&
        stage['name'] === 'regex_pi_detection' &&
        isRecord(detail) &&
        detail['action'] === 'blocked' &&
        detail['detected'] === true
      );
    })
    ? 'injection-blocked'
    : 'unproven';
}
