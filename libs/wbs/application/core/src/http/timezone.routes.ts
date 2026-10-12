import { readTimezones } from '@wbs/contracts';
import { listTimezones } from '@wbs/domain';

import { bind } from './endpoint';

/**
 * Serves the zones the project PATCH validates against — the same
 * `listTimezones` `isTimezone` reads — so a client can never offer a zone this
 * be-01 refuses (`step-node-attempts` D3). Signed-in by its declaration; the
 * list names no tenant data.
 */
export function timezoneRoutes() {
  return [
    bind(readTimezones, () =>
      Promise.resolve({ ok: true, status: 200, body: { timezones: [...listTimezones()] } }),
    ),
  ] as const;
}
