/** Malformed UTF-8/JSON with no source bytes retained in its diagnostic or cause. */
export class JsonInputRefusal extends Error {
  override readonly name = 'JsonInputRefusal';
}

/**
 * Decode raw JSON bytes with phase-specific error classification. A TypeError from schema or
 * JSON implementation code must not be confused with the decoder's invalid-UTF8 outcome.
 * @throws JsonInputRefusal for invalid UTF-8 or JSON syntax; unrelated failures propagate.
 */
export function decodeJsonInput(source: Uint8Array): unknown {
  let text: string;
  try {
    // Proof: json-fatal-utf8; `installed lint request boundary > refuses malformed JSON and invalid raw UTF-8 without reporting source bytes` fails with this injected fault and passes after restoration.
    text = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch (cause) {
    // Proof: json-unexpected-decode; `preserves an unexpected UTF-8 decoder dependency failure` fails with this injected fault and passes after restoration.
    if (!(cause instanceof TypeError)) throw cause;
    throw new JsonInputRefusal('invalid JSON input');
  }
  try {
    const input: unknown = JSON.parse(text);
    return input;
  } catch (cause) {
    // Proof: json-syntax-classifier; `preserves an internal TypeError from the lint JSON phase` fails with this injected fault and passes after restoration.
    if (!(cause instanceof SyntaxError)) throw cause;
    throw new JsonInputRefusal('invalid JSON input');
  }
}
