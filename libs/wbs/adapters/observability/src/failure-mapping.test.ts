import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseOrThrow } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

import { LogRecord } from './log-schema';
import { createLogger } from './logger';

const repositoryRoot = join(import.meta.dir, '../../../../..');
const collectorPath = 'infra/platform/observability/otel/collector.yaml';
const mappingPath = 'infra/platform/observability/elastic/settings/failure-fields.json';
const objectsPath = 'infra/platform/observability/kibana/objects/objects.ndjson';
/** The bounded identifier shape the collector requires before lifting an id into a keyword. */
const identifierMatch = 'matches "^[A-Za-z0-9_.:-]{1,128}$"';

interface Operator {
  type: string;
  id: string;
  if?: string;
  from?: string;
  to?: string;
  field?: string;
  parse_to?: string;
  on_error?: string;
}

interface KeyNode {
  key: string;
  value: unknown;
}

async function readCollectorOperators(): Promise<Operator[]> {
  const release = parse(await readFile(join(repositoryRoot, collectorPath), 'utf8')) as {
    spec: { values: { alternateConfig: { receivers: { filelog: { operators: Operator[] } } } } };
  };
  return release.spec.values.alternateConfig.receivers.filelog.operators;
}

async function readMappedFields(): Promise<Partial<Record<string, { type: string }>>> {
  const mapping = JSON.parse(await readFile(join(repositoryRoot, mappingPath), 'utf8')) as {
    properties: Partial<Record<string, { type: string }>>;
  };
  return mapping.properties;
}

/** Each lifted field as `<path in the pino line>` → `<attribute key>`, read from the moves. */
function readLiftedFields(operators: readonly Operator[]): Map<string, string> {
  const lifted = new Map<string, string>();
  for (const operator of operators) {
    if (operator.type !== 'move') continue;
    const from = /^attributes\.pino\.(.+)$/.exec(operator.from ?? '')?.[1];
    const to = /^attributes(?:\.([a-z_]+)|\["([a-z_.]+)"\])$/.exec(operator.to ?? '');
    const key = to?.[1] ?? to?.[2];
    if (from === undefined || key === undefined) {
      throw new Error(`move ${operator.id} does not lift from the parsed line into an attribute`);
    }
    lifted.set(from, key);
  }
  return lifted;
}

function keysOf(node: { required?: KeyNode[]; optional?: KeyNode[] }): KeyNode[] {
  return [...(node.required ?? []), ...(node.optional ?? [])];
}

/** Every dotted path `log-schema.ts` declares: top-level keys and the keys of each `err` branch. */
function readSchemaPaths(): Set<string> {
  const record = LogRecord.json as unknown as { required: KeyNode[]; optional: KeyNode[] };
  const paths = new Set<string>();
  for (const { key, value } of keysOf(record)) {
    paths.add(key);
    if (key !== 'err') continue;
    for (const branch of value as { required?: KeyNode[]; optional?: KeyNode[] }[]) {
      for (const nested of keysOf(branch)) paths.add(`err.${nested.key}`);
    }
  }
  return paths;
}

function readSchemaUnits(key: string): (string | number)[] {
  const record = LogRecord.json as unknown as { required: KeyNode[] };
  const node = record.required.find((candidate) => candidate.key === key);
  if (node === undefined) throw new Error(`log-schema.ts declares no required ${key}`);
  return (node.value as { unit: string | number }[]).map(({ unit }) => unit);
}

function readQuotedList(expression: string | undefined): string[] {
  const list = /\[([^\]]*)\]/.exec(expression ?? '')?.[1];
  if (list === undefined) throw new Error(`no list in ${String(expression)}`);
  return [...list.matchAll(/"([^"]+)"/g)].map(([, quoted]) => quoted);
}

function requireOperator(operators: readonly Operator[], id: string): Operator {
  const operator = operators.find((candidate) => candidate.id === id);
  if (operator === undefined) throw new Error(`${collectorPath} has no operator ${id}`);
  return operator;
}

describe('failure fields lifted into Elasticsearch', () => {
  it('lifts only paths the log schema declares, and every one of them is mapped', async () => {
    const lifted = readLiftedFields(await readCollectorOperators());
    const schemaPaths = readSchemaPaths();
    const mapped = await readMappedFields();

    expect([...lifted.keys()].filter((path) => !schemaPaths.has(path))).toEqual([]);
    // Proof: deleting `attributes.failure.fingerprint` from failure-fields.json failed this
    // assertion with `["attributes.failure.fingerprint"]` on 2026-10-11.
    expect(
      [...lifted.values()].map((key) => `attributes.${key}`).filter((field) => !(field in mapped)),
    ).toEqual([]);
    expect(
      Object.keys(mapped).filter(
        (field) => ![...lifted.values()].some((key) => field === `attributes.${key}`),
      ),
    ).toEqual([]);
  });

  it('lifts the grouping and correlation fields as keywords', async () => {
    const lifted = readLiftedFields(await readCollectorOperators());
    const mapped = await readMappedFields();
    // Proof: mapping `attributes.failure.fingerprint` as `text` failed this test with
    // `"type": "text"` for `failure.fingerprint` on 2026-10-11.
    for (const path of ['err.fingerprint', 'err.occurrence_id', 'service', 'level']) {
      const key = lifted.get(path);
      expect({ path, key, type: mapped[`attributes.${key ?? ''}`]?.type }).toEqual({
        path,
        key: expect.any(String) as string,
        type: 'keyword',
      });
    }
  });

  it('admits exactly the services and level labels the log schema declares', async () => {
    const operators = await readCollectorOperators();
    const services = readQuotedList(requireOperator(operators, 'pino-foreign').if);
    const levels = readQuotedList(requireOperator(operators, 'pino-level').if);

    // Proof: dropping `mcp-01` from the collector's pino-foreign list failed this assertion with
    // `- "mcp-01"` on 2026-10-11.
    expect(services.sort()).toEqual(readSchemaUnits('service').map(String).sort());
    expect(levels.sort()).toEqual(
      readSchemaUnits('level')
        .filter((unit): unit is string => typeof unit === 'string')
        .sort(),
    );
  });

  it('parses only object bodies and ships a body that does not parse', async () => {
    const parser = requireOperator(await readCollectorOperators(), 'pino-parser');
    // Proof: `on_error: drop` on the parser failed this test with `+ "on_error": "drop"` on
    // 2026-10-11; the k3d lab record in openspec/changes/log-failure-records/verify.md shows the
    // unparseable line still arriving with `send`.
    expect(parser).toMatchObject({
      type: 'json_parser',
      if: String.raw`body matches "^\\{"`,
      parse_to: 'attributes.pino',
      on_error: 'send',
    });
  });

  it('finds every lifted path in a real failure line the logger writes', async () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: { write: (chunk) => void lines.push(chunk) },
    });
    logger.error({ err: new Error('lifted') }, 'request failed');
    const line = parseOrThrow(LogRecord, JSON.parse(lines[0] ?? '') as Record<string, unknown>);
    const missing = [...readLiftedFields(await readCollectorOperators()).keys()].filter((path) => {
      let value: unknown = line;
      for (const segment of path.split('.')) {
        value =
          typeof value === 'object' && value !== null ? Reflect.get(value, segment) : undefined;
      }
      return typeof value !== 'string' && typeof value !== 'number';
    });
    expect(missing).toEqual([]);
  });

  it('bounds the lifted identifiers to a shape the real logger satisfies', async () => {
    const operators = await readCollectorOperators();
    const lines: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: { write: (chunk) => void lines.push(chunk) },
    });
    logger.error({ err: new Error('bounded') }, 'request failed');
    const { err } = JSON.parse(lines[0] ?? '') as { err: Record<string, string> };
    // Proof: deleting the fingerprint operator's shape match failed this assertion with
    // `failure-fingerprint` listed on 2026-10-12.
    expect(
      ['failure-occurrence-id', 'failure-fingerprint'].filter(
        (id) => !(requireOperator(operators, id).if ?? '').includes(identifierMatch),
      ),
    ).toEqual([]);
    for (const value of [err['occurrence_id'], err['fingerprint']]) {
      expect(value).toMatch(/^[A-Za-z0-9_.:-]{1,128}$/);
    }
  });

  it('builds the Kibana objects only on mapped fields of the stream the collector writes', async () => {
    const release = parse(await readFile(join(repositoryRoot, collectorPath), 'utf8')) as {
      spec: {
        values: {
          alternateConfig: {
            processors: { 'resource/stream': { attributes: { key: string; value: string }[] } };
          };
        };
      };
    };
    const dataset = release.spec.values.alternateConfig.processors[
      'resource/stream'
    ].attributes.find(({ key }) => key === 'data_stream.dataset')?.value;
    const mapped = await readMappedFields();
    const objects = (await readFile(join(repositoryRoot, objectsPath), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string; attributes: Record<string, unknown> });

    const titles = objects
      .filter(({ type }) => type === 'index-pattern')
      .map(({ attributes }) => attributes['title']);
    // Proof: titling the data view `logs-*` failed this assertion on 2026-10-12.
    expect(titles).toEqual([`logs-${String(dataset)}.otel-*`]);

    const sourceFields = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === 'object' && value !== null) {
        for (const [key, nested] of Object.entries(value)) {
          if (key === 'sourceField' && typeof nested === 'string') sourceFields.add(nested);
          else collect(nested);
        }
      }
    };
    for (const { type, attributes } of objects) if (type === 'lens') collect(attributes);
    // Proof: renaming `attributes.failure.fingerprint` in objects.ndjson failed this assertion
    // with the renamed field listed on 2026-10-12.
    expect(
      [...sourceFields].filter(
        (field) => field !== '@timestamp' && field !== '___records___' && !(field in mapped),
      ),
    ).toEqual([]);
    expect(sourceFields.has('attributes.failure.fingerprint')).toBe(true);
  });
});
