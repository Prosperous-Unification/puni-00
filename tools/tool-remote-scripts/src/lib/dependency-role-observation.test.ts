import { rejects } from 'node:assert/strict';
import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { decodeDependencyCapabilities } from './dependency-capability';
import { observeDependencyCapabilities, probeDependencyCapabilities } from './dependency-preflight';

const roles = [
  ['backend', 'be'],
  ['gateway', 'gw'],
  ['mcp', 'mcp'],
] as const;
const imageFor = (tier: string) => `registry/wbs-${tier}-01@sha256:${'a'.repeat(64)}`;

async function execute(script: string, signal?: AbortSignal): Promise<string> {
  const child = Bun.spawn([process.execPath, script], {
    env: { PATH: process.env['PATH'], CROSS_PROJECT_DEPENDENCIES: 'enabled' },
    stdout: 'pipe',
    stderr: 'pipe',
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`executable failed: ${stderr}`);
  return stdout;
}

for (const [role, tier] of roles) {
  test(`observes actual ${role} executable through exact DB-free image command`, async () => {
    const image = imageFor(tier);
    const commands: string[][] = [];
    const observation = await observeDependencyCapabilities(image, role, (args, signal) => {
      commands.push(args);
      return execute(
        new URL(
          `../../../../apps/wbs/${tier}-01/src/dependency-capabilities-cli.ts`,
          import.meta.url,
        ).pathname,
        signal,
      );
    });
    expect(commands).toEqual([
      [
        'run',
        '--rm',
        '--pull',
        'never',
        '--network',
        'none',
        '--entrypoint',
        'bun',
        image,
        'run',
        'src/dependency-capabilities-cli.ts',
      ],
    ]);
    expect(observation).toEqual({
      image,
      semantics: role === 'backend' ? [] : ['cross-project-dependencies-v1'],
    });
  });
  for (const [otherRole, otherTier] of roles.filter(([otherRole]) => role !== otherRole)) {
    test(`${role} refuses ${otherRole} payload`, async () => {
      await rejects(
        observeDependencyCapabilities(imageFor(tier), role, () =>
          execute(
            new URL(
              `../../../../apps/wbs/${otherTier}-01/src/dependency-capabilities-cli.ts`,
              import.meta.url,
            ).pathname,
          ),
        ),
        /dependency capability/,
      );
    });
    test(`${role} refuses ${otherTier} image before Docker`, async () => {
      let calls = 0;
      await rejects(
        observeDependencyCapabilities(imageFor(otherTier), role, () => {
          calls++;
          return Promise.resolve('');
        }),
        /tier/,
      );
      expect(calls).toBe(0);
    });
  }
  test(`${role} refuses mutable image before Docker`, async () => {
    let calls = 0;
    await rejects(
      observeDependencyCapabilities(`registry/wbs-${tier}-01:latest`, role, () => {
        calls++;
        return Promise.resolve('');
      }),
      /digest-pinned/,
    );
    expect(calls).toBe(0);
  });
  for (const fault of ['missing', 'unreadable', 'malformed', 'nonzero', 'stalled'] as const) {
    test(`${role} refuses actual ${fault} executable`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'role-observation-'));
      const script = join(directory, 'capability.ts');
      try {
        if (fault !== 'missing')
          await writeFile(
            script,
            fault === 'malformed'
              ? "console.log('garbage')"
              : fault === 'nonzero'
                ? 'process.exit(4)'
                : fault === 'stalled'
                  ? `setTimeout(() => console.log(${JSON.stringify(JSON.stringify({ protocol: 'wbs-dependency-runtime', version: 1, role, semantics: [] }))}), 250)`
                  : `console.log(${JSON.stringify(JSON.stringify({ protocol: 'wbs-dependency-runtime', version: 1, role, semantics: [] }))})`,
          );
        if (fault === 'unreadable') {
          expect(process.geteuid?.()).not.toBe(0);
          expect(
            await observeDependencyCapabilities(imageFor(tier), role, (_args, signal) =>
              execute(script, signal),
            ),
          ).toEqual({ image: imageFor(tier), semantics: [] });
          await chmod(script, 0);
        }
        await rejects(
          observeDependencyCapabilities(
            imageFor(tier),
            role,
            (_args, signal) => execute(script, signal),
            performance.now() + (fault === 'stalled' ? 40 : 5000),
          ),
          fault === 'stalled' ? /deadline/ : /capability/,
        );
      } finally {
        await rm(directory, { recursive: true });
      }
    });
  }
}

test('equal backend images still produce two independent observations', async () => {
  let calls = 0;
  const image = imageFor('be');
  expect(
    await probeDependencyCapabilities(image, image, () =>
      Promise.resolve(
        JSON.stringify({
          protocol: 'wbs-dependency-runtime',
          version: 1,
          role: 'backend',
          semantics: calls++ === 0 ? [] : ['cross-project-dependencies-v1'],
        }),
      ),
    ),
  ).toEqual([
    { image, semantics: [] },
    { image, semantics: ['cross-project-dependencies-v1'] },
  ]);
  expect(calls).toBe(2);
});

for (const [role, tier] of roles.filter(([role]) => role !== 'backend')) {
  test(`backend decoder still refuses actual ${role} observation`, async () => {
    const output = await execute(
      new URL(`../../../../apps/wbs/${tier}-01/src/dependency-capabilities-cli.ts`, import.meta.url)
        .pathname,
    );
    expect(() => decodeDependencyCapabilities(output)).toThrow(/backend/);
  });
}

test('observation module imports no configuration or application startup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'observation-import-'));
  try {
    const preload = join(directory, 'poison.ts');
    const script = join(directory, 'observe.ts');
    await writeFile(
      preload,
      `import { plugin } from 'bun'; plugin({ name: 'forbid-config', setup(build) { build.onLoad({ filter: /[/](?:env|config|main)[.]ts$/ }, () => { throw new Error('forbidden configuration import'); }); } });`,
    );
    await writeFile(
      script,
      `import { observeDependencyCapabilities } from ${JSON.stringify(new URL('./dependency-preflight.ts', import.meta.url).pathname)}; console.log(JSON.stringify(await observeDependencyCapabilities(${JSON.stringify(imageFor('mcp'))}, 'mcp', async () => '${JSON.stringify({ protocol: 'wbs-dependency-runtime', version: 1, role: 'mcp', semantics: [] })}')));`,
    );
    const child = Bun.spawnSync([process.execPath, '--preload', preload, script], {
      cwd: directory,
      env: { PATH: process.env['PATH'] },
      timeout: 5000,
    });
    expect(child.exitCode).toBe(0);
    expect(child.stderr.toString()).toBe('');
    expect(JSON.parse(child.stdout.toString())).toEqual({ image: imageFor('mcp'), semantics: [] });
    expect((await readdir(directory)).sort()).toEqual(['observe.ts', 'poison.ts']);
  } finally {
    await rm(directory, { recursive: true });
  }
});
