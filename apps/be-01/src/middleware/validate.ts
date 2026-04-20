import { parseOrThrow, type Type, ValidationError } from '@wbs/validation';

export class HttpError extends Error {
  override name = 'HttpError' as const;
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function validateBody<T extends Type>(schema: T): (body: unknown) => T['infer'] {
  return (body: unknown) => {
    try {
      return parseOrThrow(schema, body);
    } catch (e) {
      if (e instanceof ValidationError) {
        throw new HttpError(400, e.message);
      }
      throw e;
    }
  };
}
