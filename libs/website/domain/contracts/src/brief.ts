/** Opens the brief inside a `brief`-stage reply; the system prompt asks for it on its own line. */
export const briefOpenMarker = '[brief]';
/** Closes the brief opened by {@link briefOpenMarker}, also on its own line. */
export const briefCloseMarker = '[/brief]';

/**
 * How a `brief`-stage reply yielded the draft brief: `marked` between the markers, `fallback`
 * from an unmarked reply minus its framing, or `empty` when nothing remained to store.
 */
export type BriefCapture =
  { kind: 'marked'; body: string } | { kind: 'fallback'; body: string } | { kind: 'empty' };

const isMarkerLine = (line: string): boolean =>
  line.trim() === briefOpenMarker || line.trim() === briefCloseMarker;

/**
 * Extracts the brief from the assistant's own reply, never from visitor text. With an opening
 * marker line followed by a closing one, the trimmed lines between them are the brief. Otherwise
 * stray marker lines are dropped, then a leading line ending with ":" and a trailing line ending
 * with "?". A blank result is `empty`, so a model that marks nothing never clears or sets a brief.
 */
export function captureBrief(reply: string): BriefCapture {
  const lines = reply.split('\n');
  const open = lines.findIndex((line) => line.trim() === briefOpenMarker);
  const close =
    open < 0
      ? -1
      : lines.findIndex((line, index) => index > open && line.trim() === briefCloseMarker);
  if (close > open && open >= 0) {
    const body = lines
      .slice(open + 1, close)
      .join('\n')
      .trim();
    return body ? { kind: 'marked', body } : { kind: 'empty' };
  }
  const kept = lines.filter((line) => !isMarkerLine(line) && line.trim());
  if (kept[0]?.trim().endsWith(':')) kept.shift();
  if (kept.at(-1)?.trim().endsWith('?')) kept.pop();
  const body = kept.join('\n').trim();
  return body ? { kind: 'fallback', body } : { kind: 'empty' };
}

/**
 * The assistant reply as the thread shows it: marker lines removed, and while streaming, a last
 * line that is only the start of a marker hidden so a half-written `[bri` never flashes.
 */
export function displayReply(reply: string): string {
  const lines = reply.split('\n').filter((line) => !isMarkerLine(line));
  const last = lines.at(-1)?.trim() ?? '';
  if (last && (briefOpenMarker.startsWith(last) || briefCloseMarker.startsWith(last))) lines.pop();
  return lines.join('\n');
}
