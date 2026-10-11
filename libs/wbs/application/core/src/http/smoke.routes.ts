import { smokeEcho } from '@wbs/contracts';
import { echoSmokeText } from '@wbs/domain';

import { bind } from './endpoint';

/** Binds the deploy echo to its shared request, response and refusal declaration. */
export function smokeRoutes() {
  return [
    bind(smokeEcho, ({ body }) =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: { echoed: echoSmokeText(body.text) },
      }),
    ),
  ] as const;
}
