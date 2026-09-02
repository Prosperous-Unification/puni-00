import { parseOrThrow, type, ValidationError } from '@wbs/validation';
import { Elysia } from 'elysia';

import { SmokeService } from '../service/smoke.service';

const EchoBody = type({ text: 'string' });

/**
 * The one route in this app that validates its body through a schema.
 *
 * That is worth saying because it reads like the general mechanism and is not.
 * Every route carrying real domain input hand-parses instead, for the reason
 * `hand-parsed-body.ts` states: Elysia strips unknown properties before a guard
 * can refuse them, and a refusal has to be a code a client can branch on. This
 * route echoes a string for the deploy smoke, has no domain input to refuse, and
 * is the only place the simple form fits.
 *
 * The validator used to live in `middleware/validate.ts` with an `HttpError`
 * beside it, which read as the app's validation boundary while having exactly
 * this one caller. Both are inlined here so nothing advertises a seam the
 * routes did not take.
 */
export const smokeController = new Elysia({ prefix: '/api/smoke' })
  .decorate('smoke', new SmokeService())
  .post('/echo', ({ body, smoke, set }) => {
    try {
      return { echoed: smoke.echo(parseOrThrow(EchoBody, body).text) };
    } catch (e) {
      if (e instanceof ValidationError) {
        set.status = 400;
        return { error: e.message };
      }
      throw e;
    }
  });
