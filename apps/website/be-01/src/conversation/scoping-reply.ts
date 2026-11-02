import {
  parseScopingReply,
  type ScopingParse,
  scopingQuestions,
  type ScopingReply,
} from '@website/contracts';

/** Bounded provider schema. The shared parser additionally checks nonblank text and question/brief exclusivity. */
export const scopingReplySchema = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['version', 'message', 'nextQuestionId', 'brief'],
  properties: {
    version: { type: 'integer' as const, enum: [1] },
    message: { type: 'string' as const, minLength: 1, maxLength: 1200 },
    nextQuestionId: {
      anyOf: [
        { type: 'string' as const, enum: Object.keys(scopingQuestions) },
        { type: 'null' as const },
      ],
    },
    brief: {
      anyOf: [
        { type: 'string' as const, minLength: 1, maxLength: 4000 },
        { type: 'null' as const },
      ],
    },
  },
};

/** Parses an untrusted envelope once, without extracting prose, repairing JSON or making another call. */
export function parseProviderScopingReply(
  text: string,
  truncated: boolean,
): ScopingParse<ScopingReply> {
  // Proof: bypassing truncation failed the mounted length-finish case; removing the bound admitted oversized padded JSON in the parser test.
  if (truncated || text.length > 32000) return { kind: 'invalid', reason: 'incomplete_envelope' };
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { kind: 'invalid', reason: 'invalid_json' };
  }
  // Proof: bypassing shared validation failed the mounted forged-question envelope with known usage.
  return parseScopingReply(envelope);
}
