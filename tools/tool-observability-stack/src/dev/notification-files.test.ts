import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { renderNotificationRelease, validateNotificationRelease } from './notification-release';

interface Evidence {
  bytesRead: number[];
  opened: number[];
  closed: number[];
  notificationRelease?: {
    directory: string;
    mountedPath: string;
    manifest: unknown;
    actual: unknown;
  };
}
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

/** Executes the production Python reader and actual snapshot field with real files. ROOT, Docker records and the named UID/GID/concurrent-growth stat faults are modeled; there is no host or secret access. */
function observeFiles(fault: string, mode: 'reader' | 'snapshot' = 'reader') {
  const root = mkdtempSync(join(tmpdir(), 'puni-notification-files-'));
  roots.push(root);
  const rendered = renderNotificationRelease('a'.repeat(40));
  const directory = join(root, 'releases', 'slack-' + 'a'.repeat(40));
  mkdirSync(directory, { recursive: true, mode: 0o755 });
  for (const [name, body] of Object.entries(rendered.files))
    writeFileSync(join(directory, name), body, { mode: 0o644 });
  const target = join(directory, 'alertmanager.yaml');
  if (fault === 'missing') rmSync(target);
  if (fault === 'unreadable') chmodSync(target, 0);
  if (fault === 'writable') chmodSync(target, 0o666);
  if (fault === 'hardlink') linkSync(target, join(directory, 'alias'));
  if (fault === 'symlink') {
    rmSync(target);
    writeFileSync(join(directory, 'target'), 'config', { mode: 0o644 });
    symlinkSync(join(directory, 'target'), target);
  }
  if (fault === 'directory') {
    rmSync(target);
    mkdirSync(target, { mode: 0o755 });
  }
  if (fault === 'fifo') {
    rmSync(target);
    const made = Bun.spawnSync(['mkfifo', '-m', '644', target]);
    if (made.exitCode !== 0) throw new Error('Could not create owned FIFO fixture');
  }
  if (fault === 'oversized' || fault === 'growing') writeFileSync(target, 'x'.repeat(81920));
  if (fault === 'missing-manifest') rmSync(join(directory, 'manifest.json'));
  if (fault === 'unreadable-manifest') chmodSync(join(directory, 'manifest.json'), 0);
  if (fault === 'malformed-manifest') writeFileSync(join(directory, 'manifest.json'), '{broken');
  if (fault === 'symlink-manifest') {
    rmSync(join(directory, 'manifest.json'));
    symlinkSync(target, join(directory, 'manifest.json'));
  }
  let mounted = target;
  if (fault === 'directory-symlink') {
    const alias = join(root, 'releases', 'slack-' + 'b'.repeat(40));
    symlinkSync(directory, alias);
    mounted = join(alias, 'alertmanager.yaml');
  }
  const config = {
    Type: 'bind',
    Source: mounted,
    Destination: '/etc/puni/alertmanager.yaml',
    RW: false,
  };
  const volume = {
    Type: 'volume',
    Name: 'puni-dev-observability_alertmanager',
    Destination: '/alertmanager',
    RW: true,
  };
  const container = {
    Id: 'a'.repeat(64),
    Name: '/puni-dev-observability-alertmanager-1',
    State: { Running: true },
    Config: {
      Labels: {
        'com.docker.compose.project': 'puni-dev-observability',
        'com.docker.compose.service': 'alertmanager',
      },
    },
    Mounts: [volume, config],
  };
  if (fault === 'foreign-container') container.Name = '/foreign';
  if (fault === 'foreign-project')
    container.Config.Labels['com.docker.compose.project'] = 'foreign';
  if (fault === 'stopped') container.State.Running = false;
  if (fault === 'foreign-volume') volume.Name = 'foreign';
  if (fault === 'writable-mount') config.RW = true;
  if (fault === 'volume-config') config.Type = 'volume';
  if (fault === 'foreign-source' || fault === 'old-source') {
    const foreign =
      fault === 'foreign-source' ? join(root, 'foreign') : join(root, 'releases', 'a1ffe27e7');
    mkdirSync(foreign, { recursive: true });
    for (const [name, body] of Object.entries(rendered.files))
      writeFileSync(join(foreign, name), body, { mode: 0o644 });
    config.Source = join(foreign, 'alertmanager.yaml');
  }
  if (fault === 'missing-config-mount') container.Mounts.pop();
  if (fault === 'duplicate-config-mount') container.Mounts.push({ ...config });
  const containers = fault === 'duplicate-container' ? [container, container] : [container];
  const source = readFileSync(new URL('./runtime-snapshot.py', import.meta.url), 'utf8');
  const prefix = source.split("if sys.argv[1:] == ['h3']:")[0];
  const harness = `
import os
ROOT = pathlib.Path(${JSON.stringify(root)})
containers = json.loads(${JSON.stringify(JSON.stringify(containers))})
reads = []
opened = []
closed = []
native_open = os.open
native_close = os.close
native_stat = os.fstat
def tracked_open(*args):
    descriptor = native_open(*args)
    opened.append(descriptor)
    return descriptor
def tracked_close(descriptor):
    native_close(descriptor)
    closed.append(descriptor)
def observed_stat(descriptor):
    metadata = native_stat(descriptor)
    if os.readlink('/proc/self/fd/' + str(descriptor)) == ${JSON.stringify(target)}:
        fields = list(metadata)
        if ${JSON.stringify(fault)} == 'foreign-owner': fields[4] += 1
        if ${JSON.stringify(fault)} == 'foreign-group': fields[5] += 1
        if ${JSON.stringify(fault)} == 'growing': fields[6] = 1
        return os.stat_result(fields)
    return metadata
os.open = tracked_open
os.close = tracked_close
os.fstat = observed_stat
native_read = os.read
def tracked_read(fd, count):
    encoded = native_read(fd, count)
    reads.append(len(encoded))
    return encoded
os.read = tracked_read
verify = lambda: read_notification_release(containers)
if ${JSON.stringify(mode)} == 'snapshot':
    import ast
    fields = [value for node in ast.walk(ast.parse(${JSON.stringify(source)})) if isinstance(node, ast.Dict) for key, value in zip(node.keys, node.values) if isinstance(key, ast.Constant) and key.value == 'notificationRelease']
    if len(fields) != 1:
        raise RuntimeError('Missing unique actual notification snapshot expression')
    verify = lambda: eval(compile(ast.fix_missing_locations(ast.Expression(fields[0])), '<snapshot>', 'eval'))
try:
    observed = verify()
except Exception:
    print(json.dumps({'bytesRead': reads, 'opened': opened, 'closed': closed}))
    raise
print(json.dumps({'notificationRelease': observed, 'bytesRead': reads, 'opened': opened, 'closed': closed}))
`;
  // The test owns and bounds this process group, including a FIFO-open mutation.
  const supervisor = `
import os, signal, subprocess, sys
child = subprocess.Popen(['python3', '-c', sys.stdin.read()], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
try:
    stdout, stderr = child.communicate(timeout=1)
except subprocess.TimeoutExpired:
    os.killpg(child.pid, signal.SIGKILL)
    stdout, stderr = child.communicate(timeout=1)
    sys.stdout.buffer.write(stdout)
    sys.stderr.write('Owned notification reader attempted a blocking open\\n')
    sys.exit(124)
sys.stdout.buffer.write(stdout)
sys.stderr.buffer.write(stderr)
sys.exit(child.returncode)
`;
  const checked = Bun.spawnSync(['python3', '-c', supervisor], {
    stdin: Buffer.from(prefix + harness),
    timeout: 5000,
  });
  return {
    code: checked.exitCode,
    stdout: checked.stdout.toString(),
    stderr: checked.stderr.toString(),
    root,
    directory,
    rendered,
  };
}

test('actual notification reader measures all three owned regular files from the inspected readonly config mount', () => {
  const checked = observeFiles('none');
  expect(checked.code).toBe(0);
  const emitted = JSON.parse(checked.stdout) as Evidence;
  expect(emitted.bytesRead).toHaveLength(3);
  expect(emitted.closed).toEqual(emitted.opened);
  // ROOT is the sole modeled filesystem boundary; return it to the production path before policy validation.
  const observed = emitted.notificationRelease;
  if (!observed) throw new Error('Missing measured notification release');
  observed.directory = checked.rendered.directory;
  observed.mountedPath = checked.rendered.directory + '/alertmanager.yaml';
  expect(validateNotificationRelease(observed).sourceCommit).toBe('a'.repeat(40));
});

for (const fault of [
  'missing',
  'unreadable',
  'writable',
  'hardlink',
  'symlink',
  'directory',
  'fifo',
  'oversized',
  'growing',
  'foreign-owner',
  'foreign-group',
  'missing-manifest',
  'unreadable-manifest',
  'malformed-manifest',
  'symlink-manifest',
  'directory-symlink',
])
  test('actual notification reader refuses ' + fault + ' trusted file', () => {
    const checked = observeFiles(fault);
    expect(checked.code).not.toBe(0);
    expect(checked.code).not.toBe(124);
    expect(checked.stdout).not.toContain('notificationRelease');
    if (fault === 'missing') expect(checked.stderr).toContain('FileNotFoundError');
    if (fault === 'unreadable') expect(checked.stderr).toContain('PermissionError');
    const emitted = JSON.parse(checked.stdout) as Evidence;
    expect(emitted.closed).toEqual(emitted.opened);
    if (fault === 'oversized') expect(emitted.bytesRead).toHaveLength(1);
    if (fault === 'growing')
      expect(emitted.bytesRead).toEqual([
        Buffer.byteLength(renderNotificationRelease('a'.repeat(40)).files['manifest.json']),
        65537,
      ]);
    if (fault === 'symlink') expect(emitted.opened).toHaveLength(1);
  });

for (const fault of [
  'foreign-container',
  'foreign-project',
  'stopped',
  'foreign-volume',
  'duplicate-container',
  'writable-mount',
  'volume-config',
  'foreign-source',
  'old-source',
  'missing-config-mount',
  'duplicate-config-mount',
])
  test('actual notification reader refuses ' + fault + ' before reading files', () => {
    const checked = observeFiles(fault);
    expect(checked.code).not.toBe(0);
    expect(JSON.parse(checked.stdout)).toEqual({ bytesRead: [], opened: [], closed: [] });
  });

for (const fault of ['none', 'missing'])
  test('actual snapshot notification field invokes its measured file reader: ' + fault, () => {
    const checked = observeFiles(fault, 'snapshot');
    expect(checked.code).toBe(fault === 'none' ? 0 : 1);
    const emitted = JSON.parse(checked.stdout) as Evidence;
    expect(emitted.bytesRead.length).toBeGreaterThan(0);
    if (fault === 'none') expect(emitted.notificationRelease).toBeDefined();
    else expect(checked.stdout).not.toContain('notificationRelease');
  });
