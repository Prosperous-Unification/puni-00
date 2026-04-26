import { type Type, type } from 'arktype';

import { ValidationError } from './errors';

export { type };
export type { Type };
export { ValidationError };

export type InferSchema<T> = T extends Type<infer U> ? U : never;

export function parseOrThrow<T extends Type>(schema: T, input: unknown): T['infer'] {
  const result = schema(input);
  if (result instanceof type.errors) {
    throw new ValidationError(
      `Validation failed for value ${JSON.stringify(input)}: ${result.summary}`,
      result,
    );
  }
  return result;
}

export function defineSchema<T extends Type>(schema: T): T {
  return schema;
}
