import type { CalendarMarker } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

const MARKER_DATE = '2026-09-10';
const TIED_AT = 1_700_000_000_000;

function marker(
  id: string,
  workPackageId: string,
  overrides: Partial<CalendarMarker> = {},
): CalendarMarker {
  return {
    id,
    workPackageId,
    date: MARKER_DATE,
    name: `Marker ${id}`,
    color: null,
    createdAt: TIED_AT,
    ...overrides,
  };
}

/** Shared marker cases for stable ordering, literal dates and work-package-scoped writes. */
export function calendarMarkerRegistrations(
  open: OpenCase<'calendarMarkers'>,
): readonly CaseRegistration[] {
  return [
    storeCase(
      'calendarMarkers',
      'calendarMarkers.listFor:total-order',
      open,
      async ({ port, readers, seed }) => {
        const workPackagesBefore = structuredClone(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        );
        expect(workPackagesBefore.map((workPackage) => workPackage?.id)).toEqual([
          ...seed.workPackageIds,
        ]);

        const inserted = [
          marker('marker-c', seed.workPackageIds[0]),
          marker('marker-a', seed.workPackageIds[0]),
          marker('marker-b', seed.workPackageIds[0]),
        ];
        const writes = [];
        for (const made of inserted) writes.push(await port.create(made));
        expect(writes).toEqual(inserted.map((made) => ({ ok: true, marker: made })));
        expect(
          writes.map((write) =>
            write.ok
              ? { id: write.marker.id, date: write.marker.date, createdAt: write.marker.createdAt }
              : write,
          ),
        ).toEqual([
          { id: 'marker-c', date: MARKER_DATE, createdAt: TIED_AT },
          { id: 'marker-a', date: MARKER_DATE, createdAt: TIED_AT },
          { id: 'marker-b', date: MARKER_DATE, createdAt: TIED_AT },
        ]);

        // Proof: both sources' missing-id faults returned insertion order
        // c/a/b; the final public read failed with marker-c before marker-a.
        expect((await port.listFor(seed.workPackageIds[0])).map(({ id }) => id)).toEqual([
          'marker-a',
          'marker-b',
          'marker-c',
        ]);
        expect(await port.listFor(seed.workPackageIds[1])).toEqual([]);
        expect(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        ).toEqual(workPackagesBefore);
      },
    ),
    storeCase(
      'calendarMarkers',
      'calendarMarkers.write:work-package-scope',
      open,
      async ({ port, readers, seed }) => {
        const workPackagesBefore = structuredClone(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        );
        expect(workPackagesBefore.map((workPackage) => workPackage?.id)).toEqual([
          ...seed.workPackageIds,
        ]);

        const workPackageMarker = marker('marker-owned-a', seed.workPackageIds[0], {
          name: 'Council inspection',
        });
        const otherMarker = marker('marker-owned-b', seed.workPackageIds[1], {
          name: 'Scaffolding up',
        });
        // Proof: both sources' literal-date faults mutated an independent input
        // clone in place to 2026-09-11; this settled answer still failed against
        // the untouched 2026-09-10 expectation (Expected -1 / Received +1).
        expect(await port.create(structuredClone(workPackageMarker))).toEqual({
          ok: true,
          marker: workPackageMarker,
        });
        expect(await port.create(structuredClone(otherMarker))).toEqual({
          ok: true,
          marker: otherMarker,
        });

        const renamed = { ...workPackageMarker, name: 'Council inspection, rescheduled' };
        expect(
          await port.rename(seed.workPackageIds[0], workPackageMarker.id, renamed.name),
        ).toEqual({
          ok: true,
          marker: renamed,
        });
        const colored = { ...renamed, color: '#0386a5' };
        expect(
          await port.recolor(seed.workPackageIds[0], workPackageMarker.id, colored.color),
        ).toEqual({
          ok: true,
          marker: colored,
        });
        expect(await port.recolor(seed.workPackageIds[0], workPackageMarker.id, null)).toEqual({
          ok: true,
          marker: renamed,
        });

        const wrongWorkPackage = {
          rename: await port.rename(seed.workPackageIds[1], workPackageMarker.id, 'Mine now'),
          recolor: await port.recolor(seed.workPackageIds[1], workPackageMarker.id, '#f70100'),
          remove: await port.remove(seed.workPackageIds[1], workPackageMarker.id),
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        };
        // Proof: both sources' omitted-work-package faults routed B's rename through A;
        // this complete settled state received ok/Mine now instead of refusal/unchanged.
        expect(wrongWorkPackage).toEqual({
          rename: { ok: false, reason: 'not_found' },
          recolor: { ok: false, reason: 'not_found' },
          remove: { ok: false, reason: 'not_found' },
          workPackageA: [renamed],
          workPackageB: [otherMarker],
        });

        expect(await port.remove(seed.workPackageIds[0], workPackageMarker.id)).toEqual({
          ok: true,
          marker: renamed,
        });
        expect({
          workPackageA: await port.listFor(seed.workPackageIds[0]),
          workPackageB: await port.listFor(seed.workPackageIds[1]),
        }).toEqual({ workPackageA: [], workPackageB: [otherMarker] });
        expect(
          await Promise.all(
            seed.workPackageIds.map((workPackageId) =>
              readers.workPackages.findById(workPackageId),
            ),
          ),
        ).toEqual(workPackagesBefore);
      },
    ),
  ];
}
