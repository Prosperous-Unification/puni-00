import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

const root = join(import.meta.dir, '../../..');

interface CollectorExposition {
  image: string;
  sampleNames: string[];
}

interface CollectorRelease {
  spec: {
    values: {
      image: { repository: string; tag: string; digest: string };
      alternateConfig: {
        exporters: { elasticsearch: { sending_queue: { block_on_overflow?: unknown } } };
      };
    };
  };
}

interface RuleFile {
  spec: { groups: { rules: { alert?: string; expr: string }[] }[] };
}

async function readYaml(path: string): Promise<unknown> {
  return parse(await readFile(join(root, path), 'utf8')) as unknown;
}

// Test-only casts: each shape is the committed file the assertions below read, and a drifted
// shape fails those assertions with a TypeError rather than passing.
const exposition = JSON.parse(
  await readFile(join(root, 'infra/platform/conformance/alerts/collector-metrics.json'), 'utf8'),
) as CollectorExposition;
const collector = (await readYaml(
  'infra/platform/observability/otel/collector.yaml',
)) as CollectorRelease;
const rules = (await readYaml('infra/platform/alerts/base/rules.yaml')) as RuleFile;

describe('platform alert rules against the collector they watch', () => {
  // Proof: with `_total` restored on PuniLogIngestStopped, this test failed naming
  // `otelcol_exporter_sent_log_records_total` on 2026-10-12.
  it('names only metrics the pinned collector exposes', () => {
    const named = rules.spec.groups
      .flatMap((group) => group.rules)
      .flatMap(({ expr }) => expr.match(/\botelcol_[a-z0-9_]+/g) ?? []);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !exposition.sampleNames.includes(name))).toEqual([]);
  });

  // Proof: with the collector tag bumped to 0.162.0, this test failed on 2026-10-12.
  it('was captured from the collector image the platform pins', () => {
    const { repository, tag, digest } = collector.spec.values.image;
    expect(exposition.image).toBe(`${repository}:${tag}@${digest}`);
  });

  // Proof: with `block_on_overflow` removed from collector.yaml, this test failed on 2026-10-12.
  it('keeps a full queue blocking, which PuniLogQueueFull reports instead of a drop counter', () => {
    expect(
      collector.spec.values.alternateConfig.exporters.elasticsearch.sending_queue.block_on_overflow,
    ).toBe(true);
  });
});
