import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { AUDIT_SERVICE, AUDIT_TIMER, renderAuditUnits, writeAuditUnits } from './audit-units';
import { OpsRefusal } from './refusal';

/** `dash-host-jobs` task 4.2: the weekly audit's systemd user units, rendered and never installed. */
const paths = {
  bun: '/home/puni1/.bun/bin/bun',
  dash: '/home/puni1/puni-00/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts',
  config: '/home/puni1/.config/dash/host-pool.json',
  checkout: '/home/puni1/puni-00',
};
const scratch = mkdtempSync(join(tmpdir(), 'dash-audit-units-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('the weekly audit units (task 4.2)', () => {
  test('renders a oneshot service running ops job audit and its weekly timer', () => {
    const { service, timer } = renderAuditUnits(paths);
    expect(service).toBe(`[Unit]
Description=Twilight Dash host-job envelope audit (dash-host-jobs J9)
Documentation=file:///home/puni1/puni-00/docs/resources.md

[Service]
Type=oneshot
WorkingDirectory=/home/puni1/puni-00
ExecStart=/home/puni1/.bun/bin/bun /home/puni1/puni-00/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts ops job audit --config /home/puni1/.config/dash/host-pool.json
`);
    expect(timer).toContain('OnCalendar=weekly\nPersistent=true\n');
    expect(timer).toContain(`Unit=${AUDIT_SERVICE}\n`);
    expect(timer).toContain('WantedBy=timers.target\n');
  });

  test('refuses a unit path with a systemd specifier', () => {
    expect(() => renderAuditUnits({ ...paths, bun: '/home/%u/bun' })).toThrow(
      new OpsRefusal(
        64,
        'ops job render-audit-units: --bun "/home/%u/bun" must be an absolute, normalized path of letters, digits and ._/-',
      ),
    );
    expect(() => renderAuditUnits({ ...paths, checkout: 'puni-00' })).toThrow('--checkout');
    expect(() => renderAuditUnits({ ...paths, config: '/home/puni1/../x' })).toThrow('--config');
  });

  test('writes both files and replaces neither', () => {
    const directory = join(scratch, 'units');
    const written = writeAuditUnits(directory, renderAuditUnits(paths));
    expect(written).toEqual([join(directory, AUDIT_SERVICE), join(directory, AUDIT_TIMER)]);
    expect(readFileSync(join(directory, AUDIT_SERVICE), 'utf8')).toContain('ops job audit');
    const again = join(scratch, 'again');
    writeAuditUnits(again, renderAuditUnits(paths));
    writeFileSync(join(again, AUDIT_SERVICE), 'operator edit\n');
    expect(() => writeAuditUnits(again, renderAuditUnits(paths))).toThrow(
      `ops job render-audit-units: ${join(again, AUDIT_SERVICE)} exists; nothing replaced`,
    );
    expect(readFileSync(join(again, AUDIT_SERVICE), 'utf8')).toBe('operator edit\n');
    const partial = join(scratch, 'partial');
    mkdirSync(partial);
    writeFileSync(join(partial, AUDIT_TIMER), 'operator timer\n');
    expect(() => writeAuditUnits(partial, renderAuditUnits(paths))).toThrow(
      `ops job render-audit-units: ${join(partial, AUDIT_TIMER)} exists; nothing replaced`,
    );
    expect(existsSync(join(partial, AUDIT_SERVICE))).toBe(false);
  });
});
