import { isQuestionId, type QuestionId } from './scoping';

/** A new logical input committed under the admission lock; retries/replays never carry this part. */
export type ConversationAdmissionMarker =
  | { kind: 'initial' | 'continuation' }
  | {
      kind: 'answer';
      question_id: QuestionId;
      answer_mode: 'choice' | 'text' | 'mixed' | 'unsure';
    };
export const conversationAdmissionPart = 'data-conversation-admission';

/** Ignore unrelated stream parts; malformed recognized admission is a wire contract error. */
export function readConversationAdmission(value: unknown): ConversationAdmissionMarker | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Reflect.get(value, 'type') !== conversationAdmissionPart
  )
    return null;
  const marker: unknown = Reflect.get(value, 'data');
  if (typeof marker !== 'object' || marker === null || Array.isArray(marker))
    throw new Error('Invalid conversation admission');
  const kind: unknown = Reflect.get(marker, 'kind');
  if (
    Object.hasOwn(marker, 'kind') &&
    Object.keys(marker).length === 1 &&
    (kind === 'initial' || kind === 'continuation')
  )
    return { kind };
  const question: unknown = Reflect.get(marker, 'question_id');
  const mode: unknown = Reflect.get(marker, 'answer_mode');
  if (
    kind === 'answer' &&
    Object.keys(marker).length === 3 &&
    ['kind', 'question_id', 'answer_mode'].every((key) => Object.hasOwn(marker, key)) &&
    isQuestionId(question) &&
    (mode === 'choice' || mode === 'text' || mode === 'mixed' || mode === 'unsure')
  )
    return { kind, question_id: question, answer_mode: mode };
  // Proof: accepting malformed recognized parts failed conversation-admission.test with unknown keys and IDs.
  throw new Error('Invalid conversation admission');
}
