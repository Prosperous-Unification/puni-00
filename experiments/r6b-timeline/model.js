/** @typedef {{ id: string, packet: string, slice: string, start: number, end: number|null }} Attempt */
/** @typedef {{ start: number, span: number, width: number }} Viewport */

/** Experimental elapsed spans, never workday conversion. */
export const SPANS = [604800000, 86400000, 21600000, 3600000, 900000, 300000];

/** Strict timestamp boundary: an explicit zone is required and normalized calendar dates must agree. */
export function parseInstant(value) {
  // Proof: parse-local-as-UTC fault makes the explicit-offset test fail; invalid-date guard removal fails refusal test.
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new Error('timestamp requires explicit offset');
  const milliseconds = Date.parse(value);
  const dateOnly = value.slice(0, 10);
  // Proof: removing finite-instant guard admits a 25:00 timestamp as NaN and fails refusal test.
  if (
    !Number.isFinite(milliseconds) ||
    new Date(`${dateOnly}T00:00:00Z`).toISOString().slice(0, 10) !== dateOnly
  )
    throw new Error('invalid timestamp');
  return milliseconds;
}

/**
 * Sanitize at the fixture boundary; retain repeated slices as separate attempts and absent ends as null.
 * @param {unknown} records External fixture records.
 * @returns {Attempt[]} Validated elapsed attempts.
 */
export function parseAttempts(records) {
  // Proof: removing list guard admits an external array-like record container and fails refusal test.
  if (!Array.isArray(records)) throw new Error('attempt list required');
  const identities = new Set();
  // Proof: merge-repeated-attempts fault fails repeated slices; packet/slice is never the attempt identity.
  return records.map((record) => {
    // Proof: identity/duplicate guard removals each fail invalid, duplicate and reversed records refuse.
    if (
      !record ||
      ['id', 'packet', 'slice'].some((key) => typeof record[key] !== 'string' || !record[key])
    )
      throw new Error('invalid identity');
    if (identities.has(record.id)) throw new Error('duplicate attempt');
    identities.add(record.id);
    const start = parseInstant(record.start);
    // Proof: default-missing-endpoint fault turns null into a fabricated instant and fails the distinct-endpoints test.
    const end = record.end === null ? null : parseInstant(record.end);
    // Proof: reversed guard removal fails invalid, duplicate and reversed records refuse.
    if (end !== null && end < start) throw new Error('reversed endpoints');
    return { id: record.id, packet: record.packet, slice: record.slice, start, end };
  });
}

/**
 * Painted width is the true duration; zero/open markers are separately labeled by the renderer.
 * @param {Attempt} attempt Validated attempt.
 * @param {Viewport} viewport Epoch axis.
 */
export function placeAttempt(attempt, viewport) {
  return {
    x: ((attempt.start - viewport.start) / viewport.span) * viewport.width,
    width:
      attempt.end === null
        ? null
        : ((attempt.end - attempt.start) / viewport.span) * viewport.width,
  };
}

/**
 * Preserve the selected instant's screen position, otherwise the viewport center.
 * @param {Viewport} viewport Epoch axis.
 * @param {number} span Elapsed milliseconds visible.
 * @param {number} [anchor] Selected instant, otherwise center.
 */
export function zoomViewport(viewport, span, anchor = viewport.start + viewport.span / 2) {
  const fraction = (anchor - viewport.start) / viewport.span;
  // Proof: shift-anchor fault produces >1 CSS pixel drift in elapsed geometry and selected instant test.
  return { ...viewport, span, start: anchor - fraction * span };
}

/**
 * The pointer resolves all enlarged hit surfaces, never the last painted element alone.
 * @param {Attempt[]} attempts Packet's separate attempts.
 * @param {Viewport} viewport Epoch axis.
 * @param {number} x CSS pixel coordinate.
 */
export function candidatesAt(attempts, viewport, x) {
  // Proof: hide-enlarged-hit-target fault drops overlapping identities and fails the explicit candidate test.
  return attempts.filter((attempt) => {
    const placed = placeAttempt(attempt, viewport);
    const painted = placed.width === null ? 0 : placed.width;
    const hitWidth = Math.max(18, painted);
    const left = placed.x - (hitWidth - painted) / 2;
    return x >= left && x <= left + hitWidth;
  });
}

/** Zone changes only labels. Instants and elapsed duration stay on the epoch millisecond axis. */
export function formatInstant(milliseconds, zone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(milliseconds);
}

/** Synthetic densities deliberately repeat rows; they are not source-ledger concurrency evidence. */
export function makeLoad(rows, attemptsPerRow) {
  const start = Date.parse('2026-09-19T23:40:00Z');
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: attemptsPerRow }, (_, attempt) => ({
      id: `synthetic-${row}-${attempt}`,
      packet: `SYNTHETIC row ${row + 1}`,
      slice: `attempt ${attempt + 1}`,
      start: start + attempt * 180000,
      end: start + attempt * 180000 + 112000,
    })),
  ).flat();
}
