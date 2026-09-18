import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse, stringify } from 'yaml';

import { readToolchain } from './contracts';

const PrometheusRule = type({
  kind: "'PrometheusRule'",
  spec: { groups: 'object[]' },
});

/**
 * Run the platform alert rules' promtool unit tests with the promtool shipped in the
 * toolchain-locked Prometheus image, offline. Throws when promtool reports a failure.
 */
export async function testAlertRules(root: string): Promise<string> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const prometheus = toolchain.charts.kubePrometheusStack.images.find(
    ({ role }) => role === 'prometheus',
  );
  if (prometheus === undefined) throw new Error('The toolchain has no Prometheus image lock');
  const rule = PrometheusRule(
    parse(await readFile(join(root, 'infra/platform/alerts/base/rules.yaml'), 'utf8')),
  );
  if (rule instanceof type.errors) throw new Error(`rules.yaml is invalid: ${rule.summary}`);
  const directory = await mkdtemp(join(tmpdir(), 'puni-alert-rules-'));
  try {
    // promtool runs as the image's unprivileged user and must read the mounted rules.
    await chmod(directory, 0o755);
    await writeFile(join(directory, 'rules.yaml'), stringify({ groups: rule.spec.groups }));
    await writeFile(
      join(directory, 'rules.test.yaml'),
      await readFile(join(root, 'infra/platform/conformance/alerts/rules.test.yaml')),
    );
    const process = Bun.spawn(
      [
        'docker',
        'run',
        '--rm',
        '--network=none',
        `--volume=${directory}:/rules:ro`,
        '--entrypoint=/bin/promtool',
        `${prometheus.name}@${prometheus.digest}`,
        'test',
        'rules',
        '/rules/rules.test.yaml',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [output, errors, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    if (exitCode !== 0) throw new Error(`promtool test rules failed:\n${output}${errors}`);
    return output;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  console.log(await testAlertRules(join(import.meta.dir, '../../..')));
}
