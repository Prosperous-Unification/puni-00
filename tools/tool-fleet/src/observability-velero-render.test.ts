import { chmod, copyFile, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';
import { type Document, parseAllDocuments, parseDocument, stringify } from 'yaml';

import * as commands from './check-cli';
import { readToolchain } from './contracts';
import {
  renderAuthenticatedObservabilityReleases,
  renderObservabilityReleases,
} from './observability-render';
import { provisionObservabilityTools } from './observability-tools.fixture';
import { assertVeleroCapture } from './observability-velero-capture.test';
import { boundVeleroManifest, veleroPostRenderers } from './platform-velero-fixture.test';

const root = join(import.meta.dir, '../../..');
const tools = await provisionObservabilityTools();
const original =
  stringify({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'velero', namespace: 'puni-backup' },
    spec: {
      template: {
        spec: {
          containers: [
            { name: 'velero', image: 'example.invalid/server@sha256:' + 'a'.repeat(64) },
          ],
          volumes: [
            { name: 'cloud-credentials', secret: { secretName: 'velero-credentials' } },
            { name: 'plugins', emptyDir: {} },
            { name: 'scratch', emptyDir: {} },
          ],
        },
      },
    },
  }) +
  '---\n' +
  stringify({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'velero', namespace: 'puni-backup' },
    spec: { ports: [{ port: 8085 }] },
  }) +
  '\n---\n' +
  stringify({
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: { name: 'node-agent', namespace: 'puni-backup' },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'node-agent',
              resources: {
                requests: { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '256Mi' },
                limits: { cpu: '1', memory: '1Gi', 'ephemeral-storage': '2Gi' },
              },
              volumeMounts: [
                { name: 'host-pods', mountPath: '/host_pods', mountPropagation: 'HostToContainer' },
                {
                  name: 'host-plugins',
                  mountPath: '/host_plugins',
                  mountPropagation: 'HostToContainer',
                },
                { name: 'scratch', mountPath: '/scratch' },
              ],
            },
          ],
          volumes: [
            { name: 'host-pods', hostPath: { path: '/var/lib/kubelet/pods' } },
            { name: 'host-plugins', hostPath: { path: '/var/lib/kubelet/plugins' } },
            { name: 'scratch', emptyDir: { sizeLimit: '1Gi' } },
          ],
        },
      },
    },
  });
async function release() {
  return {
    owner: 'puni-backup/velero',
    chart: 'velero' as const,
    manifest: boundVeleroManifest(
      await readFile(join(root, 'infra/platform/backup/velero/local/velero.yaml'), 'utf8'),
    ).toString(),
  };
}
for (const fault of [
  'missing patch',
  'foreign source',
  'changed plugin',
  'missing budget',
  'foreign namespace',
  'foreign renderer',
]) {
  test(`Task25c3d direct renderer ${fault} refuses`, async () => {
    const declaration = await release();
    const document = parseDocument(declaration.manifest);
    if (fault === 'foreign namespace') {
      document.setIn(['metadata', 'namespace'], 'foreign');
      declaration.owner = 'foreign/velero';
    }
    if (fault === 'foreign renderer') document.setIn(['spec', 'postRenderers', 0, 'foreign'], true);
    if (fault === 'missing patch') document.deleteIn(['spec', 'postRenderers']);
    if (fault === 'foreign source')
      document.setIn(['spec', 'chart', 'spec', 'sourceRef', 'name'], 'foreign');
    if (fault === 'changed plugin')
      document.setIn(['spec', 'values', 'initContainers', 0, 'image'], 'foreign');
    if (fault === 'missing budget')
      document.deleteIn(['spec', 'values', 'initContainers', 0, 'resources']);
    declaration.manifest = document.toString();
    const spawn = Bun.spawnSync;
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && argv[1] === 'template')
        return { ...spawn(['true']), stdout: Buffer.from(original) };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(renderObservabilityReleases(root, tools, [declaration]));
    } finally {
      observer.mockRestore();
    }
  });
}
for (const fault of [
  'missing target',
  'duplicate target',
  'hook target',
  'wrong volumes',
  'no-op output',
]) {
  test(`Task25c3d direct renderer ${fault} refuses before accepting output`, async () => {
    let documents = parseAllDocuments(original).filter((document) => document.toJSON() !== null);
    const deployment = documents.find((document) => document.get('kind') === 'Deployment');
    if (deployment === undefined) throw new Error('Historical Velero Deployment absent');
    if (fault === 'missing target')
      documents = documents.filter((document) => document !== deployment);
    if (fault === 'duplicate target') documents.push(deployment);
    if (fault === 'hook target')
      deployment.setIn(['metadata', 'annotations', 'helm.sh/hook'], 'post-install');
    if (fault === 'wrong volumes')
      deployment.setIn(['spec', 'template', 'spec', 'volumes', 1, 'emptyDir', 'sizeLimit'], '1Mi');
    const bytes = documents.map((document) => stringify(document.toJSON())).join('---\n');
    const spawn = Bun.spawnSync;
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && ['template', 'kustomize'].includes(argv[1]))
        return { ...spawn(['true']), stdout: Buffer.from(bytes) };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(
        renderObservabilityReleases(root, tools, [await release()]),
        fault === 'missing target'
          ? /target absent/
          : fault === 'duplicate target'
            ? /duplicate resource/
            : fault === 'hook target'
              ? /target is a hook/
              : fault === 'wrong volumes'
                ? /volume precondition/
                : /Velero patch/,
      );
    } finally {
      observer.mockRestore();
    }
  });
}

for (const fault of [
  'wrong size',
  'unrelated image',
  'unrelated reference',
  'extra object',
  'missing object',
  'foreign duplicate',
]) {
  test(`Task25c3d patched output ${fault} refuses`, async () => {
    const documents: Document[] = parseAllDocuments(original);
    documents[0].setIn(
      ['spec', 'template', 'spec', 'volumes', 1, 'emptyDir', 'sizeLimit'],
      fault === 'wrong size' ? '1Mi' : '256Mi',
    );
    documents[0].setIn(['spec', 'template', 'spec', 'volumes', 2, 'emptyDir', 'sizeLimit'], '1Gi');
    if (fault === 'unrelated image')
      documents[0].setIn(['spec', 'template', 'spec', 'containers', 0, 'image'], 'foreign');
    if (fault === 'unrelated reference')
      documents[0].setIn(
        ['spec', 'template', 'spec', 'volumes', 0, 'secret', 'secretName'],
        'foreign',
      );
    if (fault === 'missing object') documents.pop();
    if (fault === 'foreign duplicate') documents.push(documents[1]);
    if (fault === 'extra object')
      documents.push(
        ...parseAllDocuments('apiVersion: v1\nkind: ConfigMap\nmetadata: {name: foreign}\n'),
      );
    const output = documents.map((document) => document.toString()).join('---\n');
    const spawn = Bun.spawnSync;
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && ['template', 'kustomize'].includes(argv[1]))
        return {
          ...spawn(['true']),
          stdout: Buffer.from(argv[1] === 'template' ? original : output),
        };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(
        renderObservabilityReleases(root, tools, [await release()]),
        /Velero patch/,
      );
    } finally {
      observer.mockRestore();
    }
  });
}
test('Task25c3d original patch runs through locked kubectl on a narrow Helm-output fixture', async () => {
  const spawn = Bun.spawnSync;
  const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
    const argv = arguments_[0];
    if (Array.isArray(argv) && argv[1] === 'template')
      return { ...spawn(['true']), stdout: Buffer.from(original) };
    return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
  });
  try {
    const output = (await renderObservabilityReleases(root, tools, [await release()]))[
      'puni-backup/velero'
    ];
    const deployment = parseAllDocuments(output).find(
      (document) => document.get('kind') === 'Deployment',
    );
    expect(
      deployment?.getIn(['spec', 'template', 'spec', 'volumes', 1, 'emptyDir', 'sizeLimit']),
    ).toBe('256Mi');
    expect(
      deployment?.getIn(['spec', 'template', 'spec', 'volumes', 2, 'emptyDir', 'sizeLimit']),
    ).toBe('1Gi');
  } finally {
    observer.mockRestore();
  }
});

for (const executable of ['helm', 'kubectl'] as const) {
  for (const fault of ['absent', 'unreadable', 'substituted'] as const) {
    test(`Task25c3d direct prepared ${executable} ${fault} refuses without invocation`, async () => {
      const directory = await scratchAsync('velero-tool-fault-');
      const marker = join(directory, 'invoked');
      for (const name of ['helm', 'kubectl']) {
        const selected = join(directory, name);
        if (name !== executable) await symlink(join(tools, name), selected);
        else if (fault === 'unreadable') {
          await copyFile(join(tools, name), selected);
          await chmod(selected, 0);
        } else if (fault === 'substituted') {
          const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
          await writeFile(
            selected,
            `#!/bin/sh\ntouch '${marker}'\nprintf '%s' '${lock.binaries[executable].version}'\n`,
          );
          await chmod(selected, 0o700);
        }
      }
      const spawn = Bun.spawnSync;
      const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
        const argv = arguments_[0];
        if (Array.isArray(argv) && argv[1] === 'template')
          return { ...spawn(['true']), stdout: Buffer.from(original) };
        return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
      });
      try {
        const rejected = renderObservabilityReleases(root, directory, [await release()]);
        if (fault === 'absent' || fault === 'unreadable')
          await assertRejected(rejected, undefined, fault === 'absent' ? 'ENOENT' : 'EACCES');
        else await assertRejected(rejected, /integrity/);
        expect(await Bun.file(marker).exists()).toBe(false);
      } finally {
        observer.mockRestore();
        if (fault === 'unreadable') await chmod(join(directory, executable), 0o700);
      }
    });
  }
}
for (const fault of ['absent', 'unreadable', 'changed'] as const) {
  test(`Task25c3d direct prepared Helm archive ${fault} refuses without fetch`, async () => {
    const directory = await scratchAsync('velero-archive-fault-');
    const archive = join(directory, 'helm.tgz');
    const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
    if (fault === 'changed') await writeFile(archive, 'foreign');
    if (fault === 'unreadable') {
      await copyFile(
        join(
          tools,
          'cache',
          `helm-${lock.binaries.helm.version}`,
          basename(new URL(lock.binaries.helm.url).pathname),
        ),
        archive,
      );
      await chmod(archive, 0);
    }
    const network = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        () => {
          throw new Error('Prohibited tool download');
        },
        { preconnect: fetch.preconnect },
      ),
    );
    try {
      const rejected = renderObservabilityReleases(root, tools, [await release()], archive);
      if (fault === 'changed') await assertRejected(rejected, /archive integrity/);
      else await assertRejected(rejected, undefined, fault === 'absent' ? 'ENOENT' : 'EACCES');
    } finally {
      network.mockRestore();
      if (fault === 'unreadable') await chmod(archive, 0o600);
    }
  });
}
for (const command of ['template', 'kustomize']) {
  test(`Task25c3d failed ${command} command refuses`, async () => {
    const spawn = Bun.spawnSync;
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && argv[1] === command) return { ...spawn(['true']), exitCode: 1 };
      if (Array.isArray(argv) && argv[1] === 'template')
        return { ...spawn(['true']), stdout: Buffer.from(original) };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(
        renderObservabilityReleases(root, tools, [await release()]),
        /command failed/,
      );
    } finally {
      observer.mockRestore();
    }
  });
}

async function assertRejected(operation: Promise<unknown>, message?: RegExp, code?: string) {
  const failure: unknown = await operation.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error && message !== undefined) expect(failure.message).toMatch(message);
  if (code !== undefined) expect(failure).toHaveProperty('code', code);
}

for (const executable of ['helm', 'kubectl']) {
  test(`Task25c3d prepared ${executable} reported version refuses`, async () => {
    const spawn = Bun.spawnSync;
    const run = commands.runChecked;
    const probe = spyOn(commands, 'runChecked').mockImplementation(async (argv, options) => {
      if (executable === 'kubectl' && argv[0].endsWith('/kubectl') && argv[1] === 'version')
        return { exitCode: 0, stdout: 'Client Version: v0.0.0', stderr: '' };
      return run(argv, options);
    });
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && argv[1] === 'version' && executable === 'helm')
        return { ...spawn(['true']), stdout: Buffer.from('v0.0.0') };
      if (Array.isArray(argv) && argv[1] === 'template')
        return { ...spawn(['true']), stdout: Buffer.from(original) };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(
        renderObservabilityReleases(root, tools, [await release()]),
        /version differs/,
      );
    } finally {
      observer.mockRestore();
      probe.mockRestore();
    }
  });
}

test('Task25c3d other releases cannot acquire a post-renderer', async () => {
  const document = parseDocument(
    await readFile(join(root, 'infra/platform/networking/traefik.yaml'), 'utf8'),
  );
  document.setIn(['spec', 'postRenderers'], veleroPostRenderers());
  const spawn = Bun.spawnSync;
  const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
    const argv = arguments_[0];
    if (Array.isArray(argv) && argv[1] === 'template')
      return { ...spawn(['true']), stdout: Buffer.from(original) };
    return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
  });
  try {
    await assertRejected(
      renderObservabilityReleases(root, tools, [
        { owner: 'traefik/traefik', chart: 'traefik', manifest: document.toString() },
      ]),
      /postRenderers/,
    );
  } finally {
    observer.mockRestore();
  }
});

test('Task25c3d actual production Velero declaration captures its distinct locked output', async () => {
  const manifest = await readFile(
    join(root, 'infra/platform/backup/velero/production/velero.yaml'),
    'utf8',
  );
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  const capture = await renderAuthenticatedObservabilityReleases(
    root,
    tools,
    [{ owner: 'puni-backup/velero', chart: 'velero', manifest }],
    archive,
  );
  const path = process.env['PUNI_VELERO_PRODUCTION_EXPORT'];
  if (path !== undefined) await writeFile(path, JSON.stringify({ manifest, ...capture }, null, 2));
  assertVeleroCapture(capture.expansions['puni-backup/velero']);
});

test('Task25c3d direct Velero archive drift refuses', async () => {
  const directory = await scratchAsync('velero-chart-fault-');
  await mkdir(join(directory, 'infra/versions'), { recursive: true });
  await mkdir(join(directory, 'infra/platform/charts'), { recursive: true });
  await copyFile(
    join(root, 'infra/versions/toolchain.json'),
    join(directory, 'infra/versions/toolchain.json'),
  );
  await writeFile(join(directory, 'infra/platform/charts/velero-12.2.0.tgz'), 'foreign archive');
  const spawn = Bun.spawnSync;
  const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
    const argv = arguments_[0];
    if (Array.isArray(argv) && argv[1] === 'template')
      return { ...spawn(['true']), stdout: Buffer.from(original) };
    return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
  });
  try {
    await assertRejected(
      renderObservabilityReleases(directory, tools, [await release()]),
      /chart differs/,
    );
  } finally {
    observer.mockRestore();
  }
});

for (const fault of [
  'missing workload',
  'wrong workload',
  'extra workload',
  'ignored disk',
  'changed disk',
  'wrong role',
  'extra app',
  'extra init',
  'extra ephemeral',
  'scratch size',
  'scratch duplicate',
  'scratch mount',
  'host path',
  'host mount',
] as const) {
  test('Task66 authenticated Velero renderer refuses ' + fault, async () => {
    const documents = parseAllDocuments(original);
    const agent = documents.find((document) => document.get('kind') === 'DaemonSet');
    if (agent === undefined) throw new Error('Node-agent fixture absent');
    const pod = ['spec', 'template', 'spec'];
    if (fault === 'missing workload')
      documents.splice(
        documents.findIndex((document) => document === agent),
        1,
      );
    if (fault === 'extra workload') {
      const foreign = parseDocument(agent.toString());
      foreign.setIn(['metadata', 'name'], 'foreign');
      documents.push(foreign);
    }
    if (fault === 'wrong workload') agent.setIn(['metadata', 'name'], 'foreign');
    if (fault === 'ignored disk')
      agent.deleteIn([...pod, 'containers', 0, 'resources', 'requests', 'ephemeral-storage']);
    if (fault === 'changed disk')
      agent.setIn([...pod, 'containers', 0, 'resources', 'limits', 'ephemeral-storage'], '4Gi');
    if (fault === 'wrong role') agent.setIn([...pod, 'containers', 0, 'name'], 'foreign');
    if (fault === 'extra app')
      agent.addIn([...pod, 'containers'], agent.getIn([...pod, 'containers', 0]));
    if (fault === 'extra init') agent.setIn([...pod, 'initContainers'], [{ name: 'foreign' }]);
    if (fault === 'extra ephemeral')
      agent.setIn([...pod, 'ephemeralContainers'], [{ name: 'foreign' }]);
    if (fault === 'scratch size')
      agent.setIn([...pod, 'volumes', 2, 'emptyDir', 'sizeLimit'], '2Gi');
    if (fault === 'scratch duplicate')
      agent.addIn([...pod, 'volumes'], { name: 'scratch', emptyDir: { sizeLimit: '1Gi' } });
    if (fault === 'scratch mount')
      agent.setIn([...pod, 'containers', 0, 'volumeMounts', 2, 'mountPath'], '/foreign');
    if (fault === 'host path') agent.setIn([...pod, 'volumes', 0, 'hostPath', 'path'], '/foreign');
    if (fault === 'host mount')
      agent.setIn(
        [...pod, 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
        'Bidirectional',
      );
    const bytes = documents.map((document) => document.toString()).join('---\n');
    const spawn = Bun.spawnSync;
    const observer = spyOn(Bun, 'spawnSync').mockImplementation((...arguments_) => {
      const argv = arguments_[0];
      if (Array.isArray(argv) && argv[1] === 'template')
        return { ...spawn(['true']), stdout: Buffer.from(bytes) };
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawnSync>;
    });
    try {
      await assertRejected(
        renderAuthenticatedObservabilityReleases(root, tools, [await release()]),
        /node-agent rendered workload|agent|common candidate/,
      );
    } finally {
      observer.mockRestore();
    }
  });
}
