import { type } from '@wbs/validation';
import { Elysia } from 'elysia';

import { HttpError, validateBody } from '../middleware/validate';
import { SmokeService } from '../service/smoke.service';

const EchoBody = type({ text: 'string' });

export const smokeController = new Elysia({ prefix: '/api/smoke' })
  .decorate('smoke', new SmokeService())
  .post('/echo', ({ body, smoke, set }) => {
    try {
      const validated = validateBody(EchoBody)(body);
      return { echoed: smoke.echo(validated.text) };
    } catch (e) {
      if (e instanceof HttpError) {
        set.status = e.statusCode;
        return { error: e.message };
      }
      throw e;
    }
  });
