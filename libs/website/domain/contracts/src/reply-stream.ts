/**
 * The UI message stream data part that replaces an assistant reply's streamed text. The API sends
 * it when a provider refusal arrives after partial text deltas: the fixed decline is the stored
 * reply, so a consumer folding the live stream must show the replacement alone, never the partial
 * text glued to it. Text parts that end before it are superseded; ordinary replies never carry it.
 */
export const replyReplacePart = 'data-reply-replace';

/**
 * The replacement text of a `data-reply-replace` chunk or message part; null for any other value.
 * A part of that type whose `data.text` is not a string is a contract break and throws.
 */
export function readReplyReplacement(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if (Reflect.get(value, 'type') !== replyReplacePart) return null;
  const data: unknown = Reflect.get(value, 'data');
  const text: unknown =
    typeof data === 'object' && data !== null ? Reflect.get(data, 'text') : undefined;
  if (typeof text !== 'string') throw new Error('A reply replacement part carries no text');
  return text;
}
