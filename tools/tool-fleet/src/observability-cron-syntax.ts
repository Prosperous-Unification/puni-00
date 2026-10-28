import { type } from 'arktype';

import { readCronDuration } from './observability-cron-duration';
import { type CronTimeZone, readCronTimeZone } from './observability-cron-zone';

export type CronSchedule =
  | {
      readonly kind: 'fields';
      readonly source: string;
      readonly origin: 'expression' | 'descriptor';
      readonly masks: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    }
  | {
      readonly kind: 'interval';
      readonly source: string;
      readonly intervalNS: bigint;
      readonly delayNS: bigint;
    };
export interface CronCalendar {
  readonly schedule: CronSchedule;
  readonly timeZone: CronTimeZone;
}

const Calendar = type({ schedule: 'string', 'timeZone?': 'string' });
const starBit = 1n << 63n;
const names = {
  month: new Map(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].map(
      (name, index) => [name, BigInt(index + 1)],
    ),
  ),
  dow: new Map(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((name, index) => [name, BigInt(index)]),
  ),
};
const descriptors = new Map([
  ['@yearly', '0 0 1 1 *'],
  ['@annually', '0 0 1 1 *'],
  ['@monthly', '0 0 1 * *'],
  ['@weekly', '0 0 * * 0'],
  ['@daily', '0 0 * * *'],
  ['@midnight', '0 0 * * *'],
  ['@hourly', '0 * * * *'],
]);
function refuseCron(): never {
  throw new Error('Cron schedule malformed');
}
function readInteger(source: string, aliases?: ReadonlyMap<string, bigint>): bigint {
  const named = aliases?.get(source.toLowerCase());
  if (named !== undefined) return named;
  // Proof: Task54 integer-grammar removal leaked an uncontrolled BigInt SyntaxError for native 1e1.
  if (!/^[+-]?[0-9]+$/.test(source)) return refuseCron();
  const integer = BigInt(source);
  // Proof: Task54 integer-int64 removal admitted a native signed-int64-overflow step.
  if (integer < 0n || integer >= 1n << 63n) return refuseCron();
  return integer;
}
function readField(
  source: string,
  minimum: bigint,
  maximum: bigint,
  aliases?: ReadonlyMap<string, bigint>,
): bigint {
  let bits = 0n;
  for (const expression of source.split(',').filter((part) => part !== '')) {
    const rangeAndStep = expression.split('/');
    const range = rangeAndStep[0];
    const lowAndHigh = range.split('-');
    const low = lowAndHigh[0];
    let start: bigint;
    let end: bigint;
    let extra = 0n;
    if (low === '*' || low === '?') {
      start = minimum;
      end = maximum;
      extra = starBit;
    } else {
      start = readInteger(low, aliases);
      if (lowAndHigh.length === 1) end = start;
      else if (lowAndHigh.length === 2) end = readInteger(lowAndHigh[1], aliases);
      // Proof: Task54 range-cardinality weakening admitted native 1-2-3.
      else return refuseCron();
    }
    let step = 1n;
    if (rangeAndStep.length === 2) {
      // Proof: Task54 step-dependency coercing zero to one admitted native */0.
      step = readInteger(rangeAndStep[1]);
      if (lowAndHigh.length === 1) end = maximum;
      if (step > 1n) extra = 0n;
      // Proof: Task54 step-cardinality removal admitted native 1/2/3.
    } else if (rangeAndStep.length !== 1) return refuseCron();
    // Proof: Task54 field-bounds removal admitted native minute60.
    if (start < minimum || end > maximum || start > end || step === 0n) return refuseCron();
    for (let position = start; position <= end; position += step) bits |= 1n << position;
    bits |= extra;
  }
  return bits;
}

/** Fresh Kubernetes1.36.4 schedule boundary; validation-only MIT port of robfig/cron3.0.1 ParseStandard/getField/getRange/parseDescriptor/Every.
 * Sources: https://github.com/robfig/cron/blob/v3.0.1/parser.go and constantdelay.go; exact MIT notice in docs/infra/observability-cron-licenses.md.
 * Pinned parser.go SHA256 3133fdf1d1865fb2e45a0a3362a4d780d97ec7cd975c8c31b1d580005e2c7cf6; constantdelay.go 0a014f614180b2c3e45afc36cff2307ed07141259b45a37fbdc9574d7f329d3b.
 * Throws before parsing embedded uppercase TZ; raw timezone-prefix/panic/host-location branches are unreachable at this boundary.
 * Preserves original codepoints, Go Unicode whitespace, signed-int64 parsing, wildcard/comma quirks and bit63.
 * Returns six masks in second/minute/hour/day-of-month/month/day-of-week order, or exact duration plus clamped whole-second delay.
 * No recurrence, feasibility, DST, charging support or controller timezone is inferred.
 */
export function readCronSchedule(source: string): CronSchedule {
  // Proof: Task54 fresh-TZ removal admitted *-TZ in the native calendar test despite the fresh-source restriction.
  if (source === '' || source.includes('TZ')) return refuseCron();
  const descriptor = descriptors.get(source);
  if (source.startsWith('@every ')) {
    // Proof: Task54 duration-dependency bypass admitted malformed @every .s through the native prepass.
    const intervalNS = readCronDuration(source.slice(7));
    const second = 1000000000n;
    const normalized = intervalNS < second ? second : intervalNS;
    return { kind: 'interval', source, intervalNS, delayNS: normalized - (normalized % second) };
  }
  if (source.startsWith('@') && descriptor === undefined) return refuseCron();
  const fields = (descriptor ?? source)
    .split(/[\t\n\v\f\r\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/)
    .filter((field) => field !== '');
  const [minute, hour, dom, month, dow] = fields;
  // Proof: Task54 field-count removal admitted six fields through the native prepass.
  if (fields.length !== 5) return refuseCron();
  return {
    kind: 'fields',
    source,
    origin: descriptor === undefined ? 'expression' : 'descriptor',
    masks: [
      1n,
      readField(minute, 0n, 59n),
      readField(hour, 0n, 23n),
      readField(dom, 1n, 31n),
      readField(month, 1n, 12n, names.month),
      readField(dow, 0n, 6n, names.dow),
    ],
  };
}

/** Validates supplied CronJob calendar fields once at the native source boundary; retains explicit zone knowledge for lifecycle policy. */
export function readCronCalendar(spec: unknown): CronCalendar {
  const calendar = Calendar(spec);
  // Proof: Task54 calendar-shape removal lost controlled refusal of a native null schedule.
  if (calendar instanceof type.errors || Array.isArray(spec))
    throw new Error('Cron calendar malformed');
  return {
    // Proof: Task54 schedule-dependency substitution admitted the native six-field schedule.
    schedule: readCronSchedule(calendar.schedule),
    // Proof: Task54 zone-dependency omission admitted native Local instead of throwing.
    timeZone: readCronTimeZone(calendar.timeZone),
  };
}
