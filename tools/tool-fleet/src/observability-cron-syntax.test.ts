import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import reference from './fixtures/cron-go1.26.0-robfig3.0.1-reference.json';
import { readCronDuration } from './observability-cron-duration';
import { readCronCalendar, readCronSchedule } from './observability-cron-syntax';
import { readCronTimeZone } from './observability-cron-zone';
import zones from './observability-cron-zones.json';

interface Observation {
  id: string;
  operation: string;
  value: string;
  timeZone?: string;
  durationNS?: string;
  parse?: { status: string; kind?: string; masks?: string[]; delayNS?: string };
}
const observations: Observation[] = reference.reference.observations;

test('retained comparison covers every original ID and the exact pinned catalogue', () => {
  expect(observations).toHaveLength(337);
  expect(
    observations.map(({ id, operation, value, timeZone }) => ({
      id,
      operation,
      value,
      ...(timeZone === undefined ? {} : { timeZone }),
    })),
  ).toEqual(
    reference.corpus.cases.map(({ id, operation, value, ...entry }) => ({
      id,
      operation,
      value,
      ...('timeZone' in entry ? { timeZone: entry.timeZone } : {}),
    })),
  );
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('./observability-cron-zones.json', import.meta.url)))
      .digest('hex'),
  ).toBe(reference.provenance.sourceHashes['zone-catalogue.json']);
  expect(observations.map(({ id }) => id)).toEqual(reference.corpus.cases.map(({ id }) => id));
  expect(reference.portablePolicy.map(({ id }) => id)).toEqual(observations.map(({ id }) => id));
  expect(new Set(zones).size).toBe(598);
  expect(zones.every((name) => readCronTimeZone(name).kind === 'known')).toBe(true);
});
for (const [index, observation] of observations.entries()) {
  const policy = reference.portablePolicy[index];
  test(`pinned fresh calendar reference ${observation.id} ${observation.operation}`, () => {
    const { value } = observation;
    if (observation.operation === 'duration') {
      if (observation.durationNS === undefined) expect(() => readCronDuration(value)).toThrow();
      else expect(readCronDuration(value).toString()).toBe(observation.durationNS);
      return;
    }
    if (observation.operation === 'zone') {
      if (policy.zoneKind === 'malformed') expect(() => readCronTimeZone(value)).toThrow();
      else
        expect<{ kind: string | undefined; name?: string }>(readCronTimeZone(value)).toEqual({
          kind: policy.zoneKind,
          name: value,
        });
      return;
    }
    if (!policy.scheduleAccepted) expect(() => readCronSchedule(value)).toThrow();
    else {
      const schedule = readCronSchedule(value);
      expect(schedule.source).toBe(value);
      expect<string | undefined>(schedule.kind).toBe(observation.parse?.kind);
      if (schedule.kind === 'fields') {
        expect<string[] | undefined>(
          schedule.masks.map((mask) => mask.toString(16).padStart(16, '0')),
        ).toEqual(observation.parse?.masks);
        expect(schedule.origin).toBe(value.startsWith('@') ? 'descriptor' : 'expression');
      } else {
        expect<string | undefined>(schedule.delayNS.toString()).toBe(observation.parse?.delayNS);
        const duration = observations.find(
          (entry) => entry.operation === 'duration' && entry.value === value.slice(7),
        );
        expect(duration?.durationNS).toBeDefined();
        expect<string | undefined>(schedule.intervalNS.toString()).toBe(duration?.durationNS);
      }
    }
    const spec = {
      schedule: value,
      ...(observation.timeZone === undefined ? {} : { timeZone: observation.timeZone }),
    };
    if (!policy.scheduleAccepted || policy.zoneKind === 'malformed') {
      expect(() => readCronCalendar(spec)).toThrow();
    } else {
      const calendar = readCronCalendar(spec);
      expect<{ kind: string | undefined; name?: string }>(calendar.timeZone).toEqual(
        policy.zoneKind === 'absent'
          ? { kind: 'absent' }
          : { kind: policy.zoneKind, name: observation.timeZone },
      );
    }
  });
}
for (const spec of [
  null,
  [],
  {},
  { schedule: null },
  { schedule: 5 },
  { schedule: '* * * * *', timeZone: null },
  { schedule: '* * * * *', timeZone: 4 },
]) {
  test(`calendar rejects malformed boundary shape ${JSON.stringify(spec)}`, () => {
    expect(() => readCronCalendar(spec)).toThrow();
  });
}
