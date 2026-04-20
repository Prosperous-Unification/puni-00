import { parseOrThrow, type Type } from '@wbs/validation';

export function defineConfig<T extends Type>(
  schema: T,
  envSource: Record<string, string | undefined> = process.env,
): T['infer'] {
  return parseOrThrow(schema, envSource);
}
