import { closeSync, constants, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';

import { OpsRefusal } from './refusal';

/** Where `ops job render-audit-units` puts each unit, and what it names. */
export interface AuditUnitPaths {
  /** The `bun` the service runs Dash with. */
  readonly bun: string;
  /** Dash's `src/entrypoint.ts` or installed entry. */
  readonly dash: string;
  /** The host pool configuration `ops job audit` reads. */
  readonly config: string;
  /** The checkout whose catalogue the audit judges; the service's working directory. */
  readonly checkout: string;
}

export const AUDIT_SERVICE = 'dash-job-audit.service';
export const AUDIT_TIMER = 'dash-job-audit.timer';

const SERVICE_TEMPLATE = `[Unit]
Description=Twilight Dash host-job envelope audit (dash-host-jobs J9)
Documentation=file://@CHECKOUT@/docs/resources.md

[Service]
Type=oneshot
WorkingDirectory=@CHECKOUT@
ExecStart=@BUN@ @DASH@ ops job audit --config @CONFIG@
`;

const TIMER_TEMPLATE = `[Unit]
Description=Weekly Twilight Dash host-job envelope audit (dash-host-jobs J9)

[Timer]
OnCalendar=weekly
Persistent=true
RandomizedDelaySec=1h
Unit=${AUDIT_SERVICE}

[Install]
WantedBy=timers.target
`;

/**
 * A path a unit may name: absolute, normalized and spelled without systemd specifiers, spaces,
 * quotes or escapes, as `render-observation-units` requires of its paths.
 * @throws OpsRefusal 64 naming the flag otherwise.
 */
function checkUnitPath(flag: string, path: string): void {
  // Proof: without it `refuses a unit path with a systemd specifier` (audit-units.test.ts)
  // rendered `/home/%u/bun` without a refusal (2026-11-02, Slice 4).
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    path === sep ||
    !/^\/[A-Za-z0-9._/-]+$/.test(path)
  )
    throw new OpsRefusal(
      64,
      `ops job render-audit-units: ${flag} ${JSON.stringify(path)} must be an absolute, normalized path of letters, digits and ._/-`,
    );
}

/**
 * The weekly systemd user units for `ops job audit` (J9): a oneshot service that fails when the
 * audit names drift (exit 1), so `systemctl --user --failed` shows it, and its timer.
 * @throws OpsRefusal 64 when a path cannot be named in a unit.
 */
export function renderAuditUnits(paths: AuditUnitPaths): { service: string; timer: string } {
  const flags = [
    ['--bun', paths.bun],
    ['--dash', paths.dash],
    ['--config', paths.config],
    ['--checkout', paths.checkout],
  ] as const;
  for (const [flag, path] of flags) checkUnitPath(flag, path);
  const service = SERVICE_TEMPLATE.replaceAll('@CHECKOUT@', paths.checkout)
    .replaceAll('@BUN@', paths.bun)
    .replaceAll('@DASH@', paths.dash)
    .replaceAll('@CONFIG@', paths.config);
  if (/@[A-Z]+@/.test(service)) throw new Error('audit unit placeholder unresolved');
  return { service, timer: TIMER_TEMPLATE };
}

/**
 * Write the rendered units into `directory`, creating it owner-only, never replacing a file:
 * installing them is the operator's step (`docs/resources.md`).
 * @throws OpsRefusal 64 when a unit file already exists there.
 */
export function writeAuditUnits(
  directory: string,
  units: { service: string; timer: string },
): string[] {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Both names are checked before either is written, so a refusal leaves no half pair.
  // Proof: without this check `writes both files and replaces neither` (audit-units.test.ts)
  // found the service written beside the operator's timer (2026-11-02, Slice 4).
  for (const name of [AUDIT_SERVICE, AUDIT_TIMER])
    if (existsSync(join(directory, name)))
      throw new OpsRefusal(
        64,
        `ops job render-audit-units: ${join(directory, name)} exists; nothing replaced`,
      );
  const written: string[] = [];
  for (const [name, text] of [
    [AUDIT_SERVICE, units.service],
    [AUDIT_TIMER, units.timer],
  ] as const) {
    const path = join(directory, name);
    let descriptor: number;
    try {
      descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')
        throw new OpsRefusal(64, `ops job render-audit-units: ${path} exists; nothing replaced`, {
          cause,
        });
      throw cause;
    }
    try {
      writeSync(descriptor, text);
    } finally {
      closeSync(descriptor);
    }
    written.push(path);
  }
  return written;
}
