import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

const runbook = readFileSync(
  new URL('../../../../docs/runbook-dev-observability-runtime.md', import.meta.url),
  'utf8',
);
test('reviewed helper accepts fresh operation basenames and retains both legacy receipts', () => {
  const assertion = runbook.split('\n').find((line) => line.startsWith('assert receipt '));
  expect(assertion).toBeDefined();
  for (const receipt of [
    'grafana-integration.json',
    'grafana-integration-restored.json',
    'grafana-operation-20261026-restore-2.json',
    'grafana-operation-a.json',
  ]) {
    const child = Bun.spawnSync([
      'python3',
      '-c',
      `import re,sys\nreceipt=sys.argv[1]\n${String(assertion)}`,
      receipt,
    ]);
    expect(child.exitCode).toBe(0);
  }
});
test('reviewed helper refuses paths traversal unknown and unbounded operation names', () => {
  const assertion = runbook.split('\n').find((line) => line.startsWith('assert receipt '));
  for (const receipt of [
    '/tmp/receipt.json',
    '../grafana-operation-a.json',
    'grafana-operation-../a.json',
    'grafana-operation-.json',
    'grafana-operation-A.json',
    'grafana-operation-' + 'a'.repeat(65) + '.json',
    'unknown.json',
    'grafana-operation-a.json\n',
  ]) {
    const child = Bun.spawnSync([
      'python3',
      '-c',
      `import re,sys\nreceipt=sys.argv[1]\n${String(assertion)}`,
      receipt,
    ]);
    expect(child.exitCode).toBe(1);
  }
});
