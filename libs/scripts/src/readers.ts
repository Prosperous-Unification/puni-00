import { parseOrThrow, type Type } from '@wbs/validation';
import { parse as parseYaml } from 'yaml';

export async function readJson<T extends Type>(path: string, schema: T): Promise<T['infer']> {
  const raw = (await Bun.file(path).json()) as unknown;
  return parseOrThrow(schema, raw);
}

export async function readYaml<T extends Type>(path: string, schema: T): Promise<T['infer']> {
  const text = await Bun.file(path).text();
  const raw = parseYaml(text) as unknown;
  return parseOrThrow(schema, raw);
}
