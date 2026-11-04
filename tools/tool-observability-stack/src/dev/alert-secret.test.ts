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

import fixture from '../../fixtures/runtime.json';
import { validateRuntimeSnapshot } from './runtime';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});
const observedNow = Math.max(fixture.h1.observedAt, fixture.h3.observedAt) + 1;

for (const [name, proof] of [
  ['missing', undefined],
  ['false', false],
  ['empty', ''],
  ['unreadable', 'unreadable'],
  ['malformed', {}],
] as const)
  test('runtime preflight refuses ' + name + ' Slack secret evidence', () => {
    const monitor = { ...fixture.h3 };
    if (proof === undefined) Reflect.deleteProperty(monitor, 'slackSecret');
    else Object.assign(monitor, { slackSecret: proof });
    expect(() => validateRuntimeSnapshot(monitor, fixture.h1, observedNow)).toThrow(/slackSecret/);
  });

test('runtime preflight accepts only verified Slack secret evidence with the existing ownership checks', () => {
  expect(
    validateRuntimeSnapshot({ ...fixture.h3, slackSecret: 'verified' }, fixture.h1, observedNow)
      .volumes,
  ).toHaveLength(6);
  expect(
    validateRuntimeSnapshot({ ...fixture.h3, slackSecret: 'verified' }, fixture.h1, observedNow)
      .slackSecret,
  ).toBe('verified');
});

const webhook = 'https://' + 'hooks.slack.com/services/T0CDTQBSBU0/BFAKE/TESTONLY';

/** Actual Python helper and its fixed shell reader use real ordinary files. Only the Docker invocation/path, UID:GID role and deliberate verifier-return fault are modeled. Snapshot mode executes the actual adjacent guard statements, readiness field and JSON output expression selected from production AST; unrelated snapshot fields are omitted. No container or actual webhook is used. */
function readSecret(fault: string, mode: 'reader' | 'snapshot' = 'reader') {
  const root = mkdtempSync(join(tmpdir(), 'puni-alert-secret-'));
  roots.push(root);
  const path = join(root, 'secret');
  let body = webhook + '\n';
  if (fault === 'malformed') body = 'not a Slack webhook\n';
  if (fault === 'foreign-workspace') body = webhook.replace('T0CDTQBSBU0', 'TFOREIGN') + '\n';
  if (fault === 'missing-newline') body = webhook;
  if (fault === 'extra-lines') body += webhook + '\n';
  if (fault === 'oversized') body = webhook + 'x'.repeat(1024 - webhook.length) + '\n';
  if (fault === 'truncated') body += 'x'.repeat(8192);
  if (fault === 'fifo') {
    const created = Bun.spawnSync(['mkfifo', '-m', '600', path]);
    if (created.exitCode !== 0) throw new Error('Could not create owned FIFO fixture');
  } else if (fault === 'directory') {
    mkdirSync(path, { mode: 0o600 });
  } else if (fault === 'symlink') {
    writeFileSync(join(root, 'target'), body, { mode: 0o600 });
    symlinkSync(join(root, 'target'), path);
  } else if (fault !== 'missing') {
    writeFileSync(path, body, { mode: 0o600 });
  }
  if (fault === 'unreadable') chmodSync(path, 0);
  if (fault === 'public') chmodSync(path, 0o644);
  if (fault === 'hardlink') linkSync(path, join(root, 'alias'));
  const source = readFileSync(new URL('./runtime-snapshot.py', import.meta.url), 'utf8');
  const prefix = source.split("if sys.argv[1:] == ['h3']:")[0];
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
    Mounts: [
      {
        Type: 'volume',
        Name: 'puni-dev-observability_alertmanager',
        Destination: '/alertmanager',
        RW: true,
      },
    ],
  };
  if (fault === 'foreign-container') container.Name = '/foreign';
  if (fault === 'foreign-project')
    container.Config.Labels['com.docker.compose.project'] = 'foreign';
  if (fault === 'foreign-service')
    container.Config.Labels['com.docker.compose.service'] = 'foreign';
  if (fault === 'stopped-container') container.State.Running = false;
  if (fault === 'invalid-container-id') container.Id = 'foreign';
  if (fault === 'foreign-volume') container.Mounts[0].Name = 'foreign';
  if (fault === 'bind-mount') container.Mounts[0].Type = 'bind';
  if (fault === 'readonly-mount') container.Mounts[0].RW = false;
  if (fault === 'missing-mount') container.Mounts = [];
  if (fault === 'duplicate-mount') container.Mounts.push({ ...container.Mounts[0] });
  const containers = fault === 'duplicate-container' ? [container, container] : [container];
  const harness = `
import os
containers = json.loads(${JSON.stringify(JSON.stringify(containers))})
native_check_output = subprocess.check_output
observed = []
reads = []
blocked = []
def execute(argv, **options):
    observed.append(argv[:7])
    if argv[:7] != ['sudo', '-n', 'docker', 'exec', 'a' * 64, '/bin/sh', '-ec'] or len(argv) != 8:
        raise RuntimeError('Unexpected secret reader command')
    command = argv[7]
    if command.count('/alertmanager/secrets/slack-webhook') != 1 or command.count('65534:65534:600:1') != 1:
        raise RuntimeError('Fixed secret path/owner contract changed')
    command = command.replace('/alertmanager/secrets/slack-webhook', ${JSON.stringify(path)})
    command = command.replace('65534:65534:600:1', str(os.getuid()) + ':' + str(os.getgid()) + ':600:1')
    if options['timeout'] != 8:
        raise RuntimeError('Secret reader command lost its fixed deadline')
    child = subprocess.Popen(['/bin/sh', '-ec', command], stdout=subprocess.PIPE, start_new_session=True)
    try:
        encoded, _ = child.communicate(timeout=1)
    except subprocess.TimeoutExpired:
        blocked.append(True)
        os.killpg(child.pid, 9)
        child.communicate(timeout=1)
        raise RuntimeError('Owned secret reader attempted a blocking open')
    if child.returncode != 0:
        raise subprocess.CalledProcessError(child.returncode, child.args)
    reads.append(len(encoded))
    return encoded
subprocess.check_output = execute
if ${JSON.stringify(fault)} == 'credential-return':
    actual_verifier = verify_slack_secret
    def altered_verifier(records):
        actual_verifier(records)
        return ${JSON.stringify(webhook)}
    verify_slack_secret = altered_verifier
import inspect
verify = lambda: verify_slack_secret(containers) if inspect.signature(verify_slack_secret).parameters else verify_slack_secret()
if ${JSON.stringify(mode)} == 'snapshot':
    import ast, contextlib, io
    tree = ast.parse(${JSON.stringify(source)})
    branches = [node for node in tree.body if isinstance(node, ast.If)]
    if len(branches) != 1:
        raise RuntimeError('Missing unique actual snapshot producer branch')
    statements = branches[0].body
    snapshots = [(index, node) for index, node in enumerate(statements) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'snapshot' for target in node.targets)]
    if len(snapshots) != 1:
        raise RuntimeError('Missing unique actual h3 snapshot assignment')
    index, assignment = snapshots[0]
    fields = [(key, value) for key, value in zip(assignment.value.keys, assignment.value.values) if isinstance(key, ast.Constant) and key.value == 'slackSecret']
    if len(fields) != 1:
        raise RuntimeError('Missing unique actual snapshot secret expression')
    start = index
    while start > 0 and isinstance(statements[start - 1], ast.Expr):
        start -= 1
    output = [node for node in tree.body if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == 'print']
    if len(output) != 1:
        raise RuntimeError('Missing unique actual snapshot output')
    selected = ast.Assign(targets=assignment.targets, value=ast.Dict(keys=[fields[0][0]], values=[fields[0][1]]))
    producer = ast.fix_missing_locations(ast.Module(body=statements[start:index] + [selected] + output, type_ignores=[]))
    def produce():
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            exec(compile(producer, '<snapshot>', 'exec'), globals())
        return json.loads(stream.getvalue())['slackSecret']
    verify = produce
try:
    status = verify()
except Exception:
    print(json.dumps({'readerInvocations': len(observed), 'bytesRead': reads, 'blocked': bool(blocked)}))
    raise
print(json.dumps({'slackSecret': status, 'readerInvocations': len(observed), 'bytesRead': reads, 'blocked': bool(blocked)}))
`;
  const checked = Bun.spawnSync(['python3', '-c', prefix + harness], { timeout: 5000 });
  if (fault === 'directory') chmodSync(path, 0o700);
  return {
    code: checked.exitCode,
    stdout: checked.stdout.toString(),
    stderr: checked.stderr.toString(),
  };
}

test('actual secret reader returns a nonsecret verification marker for a protected valid file', () => {
  const checked = readSecret('none');
  expect(checked.code).toBe(0);
  expect(JSON.parse(checked.stdout)).toMatchObject({
    slackSecret: 'verified',
    readerInvocations: 1,
  });
  expect(checked.stdout).not.toContain(webhook);
});

for (const fault of [
  'missing',
  'unreadable',
  'public',
  'hardlink',
  'symlink',
  'directory',
  'fifo',
  'malformed',
  'foreign-workspace',
  'missing-newline',
  'extra-lines',
  'oversized',
  'truncated',
])
  test('actual secret reader refuses ' + fault + ' file before returning verified evidence', () => {
    const checked = readSecret(fault);
    expect(checked.code).not.toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({ readerInvocations: 1 });
    expect(checked.stdout).not.toContain('verified');
    expect(checked.stdout + checked.stderr).not.toContain(webhook);
    if (fault === 'fifo') expect(JSON.parse(checked.stdout)).toMatchObject({ blocked: false });
    if (fault === 'truncated')
      expect(JSON.parse(checked.stdout)).toMatchObject({ bytesRead: [1025] });
    if (fault === 'unreadable') expect(checked.stderr).toMatch(/Permission denied/);
    if (fault === 'missing') expect(checked.stderr).toMatch(/not a regular file/);
  });

for (const fault of ['none', 'missing', 'unreadable', 'malformed'])
  test('actual snapshot field requires its secret reader: ' + fault, () => {
    const checked = readSecret(fault, 'snapshot');
    expect(checked.code).toBe(fault === 'none' ? 0 : 1);
    expect(JSON.parse(checked.stdout)).toMatchObject({ readerInvocations: 1 });
    if (fault === 'none')
      expect(JSON.parse(checked.stdout)).toMatchObject({ slackSecret: 'verified' });
    else expect(checked.stdout).not.toContain('verified');
    expect(checked.stdout + checked.stderr).not.toContain(webhook);
  });

for (const fault of [
  'foreign-container',
  'foreign-project',
  'foreign-service',
  'stopped-container',
  'invalid-container-id',
  'foreign-volume',
  'bind-mount',
  'readonly-mount',
  'missing-mount',
  'duplicate-mount',
  'duplicate-container',
])
  test('actual secret reader refuses ' + fault + ' before container execution', () => {
    const checked = readSecret(fault);
    expect(checked.code).not.toBe(0);
    expect(JSON.parse(checked.stdout)).toMatchObject({ readerInvocations: 0 });
    expect(checked.stdout).not.toContain('verified');
    expect(checked.stdout + checked.stderr).not.toContain(webhook);
  });

test('actual snapshot output ignores a credential-shaped verifier return after required verification', () => {
  const checked = readSecret('credential-return', 'snapshot');
  expect(checked.code).toBe(0);
  expect(checked.stdout + checked.stderr).not.toContain(webhook);
  expect(JSON.parse(checked.stdout)).toMatchObject({
    slackSecret: 'verified',
    readerInvocations: 1,
  });
});
