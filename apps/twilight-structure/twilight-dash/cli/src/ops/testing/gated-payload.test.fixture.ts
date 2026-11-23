import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import type { Socket } from 'node:net';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import { encodeGatedEnvironment } from '../gated-payload-protocol';

const [role, root, bundle, scenario] = Array.from({ length: 4 }, (_, index) =>
  process.argv.at(index + 2),
);
if (root === undefined || bundle === undefined || scenario === undefined)
  throw new Error('missing fixture operands');
if (role === 'payload') {
  const original: unknown = JSON.parse(readFileSync(join(root, 'endpoints.json'), 'utf8'));
  if (!Array.isArray(original) || !original.every((entry) => typeof entry === 'string'))
    throw new Error('bad endpoint metadata');
  const inherited = readdirSync('/proc/self/fd').flatMap((fd) => {
    try {
      const endpoint = readlinkSync('/proc/self/fd/' + fd);
      return original.includes(endpoint) ? [endpoint] : [];
    } catch (cause) {
      if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
      return [];
    }
  });
  const selected = ['PWD', 'SHLVL', '_', '__proto__', 'constructor'];
  const helperArgv = readFileSync('/proc/' + String(process.ppid) + '/cmdline', 'utf8')
    .split('\0')
    .filter(Boolean);
  writeFileSync(
    join(root, 'payload.json'),
    JSON.stringify({
      pid: process.pid,
      ppid: process.ppid,
      helperArgv,
      helperExecutable: readlinkSync('/proc/' + String(process.ppid) + '/exe'),
      privateInHelperArgv: helperArgv.some((word) =>
        word.includes(process.env['PRIVATE_CANARY'] ?? '\0'),
      ),
      inherited,
      selected: Object.fromEntries(selected.map((key) => [key, process.env[key] ?? null])),
      secretHash: createHash('sha256')
        .update(process.env['PRIVATE_CANARY'] ?? '')
        .digest('hex'),
      largeCount: Object.keys(process.env).filter((key) => key.startsWith('BULK_')).length,
      argv: process.argv.slice(6),
      startup: Object.fromEntries(
        ['BUN_OPTIONS', 'BUN_INSPECT_PRELOAD', 'NODE_OPTIONS', 'BUN_BE_BUN'].map((key) => [
          key,
          process.env[key] ?? null,
        ]),
      ),
    }),
  );
  const input = readFileSync(0);
  writeFileSync(1, input);
  writeFileSync(2, new Uint8Array([255, 0, 253]));
  if (
    [
      'early-done',
      'duplicate-start',
      'group-TERM',
      'group-INT',
      'group-HUP',
      'wrapper-TERM',
      'controller-eof',
    ].includes(scenario)
  )
    while (!existsSync(join(root, 'release-payload'))) await Bun.sleep(5);
  process.exitCode = 37;
} else if (role === 'controller') {
  const selected = ['queued-before-transition', 'environment-close-fault'].includes(scenario)
    ? new URL('./gated-observation.test.fixture.ts', import.meta.url).pathname
    : bundle;
  const launch = createLaunch(process.execPath, selected);
  const input = openSync(join(root, 'stdin'), 'r');
  const launchWords = [
    ...launch,
    'dash',
    'ops',
    'job',
    'payload-internal-v1',
    '--',
    process.execPath,
    '--no-env-file',
    '--config=/dev/null',
    import.meta.path,
    'payload',
    root,
    bundle,
    scenario,
    '',
    'literal ; $()',
  ];
  if (scenario === 'missing-program') launchWords[launch.length + 5] = '/absent/puni-c34-payload';
  if (scenario === 'nonexecutable') {
    const refused = join(root, 'not-executable');
    writeFileSync(refused, 'not executable', { mode: 0o600 });
    launchWords[launch.length + 5] = refused;
  }
  const helperEnvironment = Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'].flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]],
    ),
  );
  if (scenario === 'payload-preload') {
    const preload = join(root, 'candidate-preload.mjs');
    writeFileSync(
      preload,
      'await Bun.write(' + JSON.stringify(join(root, 'candidate-preloaded')) + ', "unsafe");',
    );
    writeFileSync(join(root, 'bunfig.toml'), 'preload = [' + JSON.stringify(preload) + ']\n');
    writeFileSync(join(root, '.env'), 'CANDIDATE_DOTENV=unsafe\n');
    helperEnvironment['BUN_OPTIONS'] = '--preload ' + JSON.stringify(preload);
    helperEnvironment['BUN_INSPECT_PRELOAD'] = preload;
    helperEnvironment['NODE_OPTIONS'] = '--require=' + preload;
    helperEnvironment['BUN_BE_BUN'] = '1';
  }
  const scopedWords =
    scenario === 'systemd'
      ? [
          'systemd-run',
          '--user',
          '--scope',
          '--quiet',
          '--collect',
          '--unit=puni-c34-helper-' + String(process.pid),
          '--',
          ...launchWords,
        ]
      : launchWords;
  const helper = spawn(
    scopedWords[0] ??
      (() => {
        throw new Error('missing launch');
      })(),
    scopedWords.slice(1),
    {
      cwd: root,
      detached: true,
      stdio:
        scenario === 'missing-fds'
          ? [input, 'inherit', 'inherit']
          : [input, 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
      env: helperEnvironment,
    },
  );
  closeSync(input);
  if (helper.pid === undefined) throw new Error('helper did not start');
  const helperPid = helper.pid;
  if (scenario === 'missing-fds') {
    const ended: unknown = await once(helper, 'exit');
    if (!Array.isArray(ended)) throw new Error('invalid direct refusal observation');
    const code: unknown = ended[0],
      signal: unknown = ended[1];
    writeFileSync(join(root, 'receipt.json'), JSON.stringify({ code, signal, reported: '' }));
  } else {
    writeFileSync(
      join(root, 'endpoints.json'),
      JSON.stringify(
        [3, 4, 5].map((fd) => readlinkSync('/proc/' + String(helperPid) + '/fd/' + String(fd))),
      ),
    );
    const control = helper.stdio[3],
      status = helper.stdio[4],
      environment = helper.stdio.at(5);
    // node:child_process gives native pipe sockets for precisely these declared descriptors.
    if (
      control === null ||
      control === undefined ||
      status === null ||
      status === undefined ||
      environment === null ||
      environment === undefined
    )
      throw new Error('missing native pipes');
    const controlSocket = control as Socket,
      statusSocket = status as Socket,
      environmentSocket = environment as Socket;
    const ended = once(helper, 'exit');
    const secret = randomBytes(32).toString('hex');
    const values: Record<string, string> = Object.fromEntries([
      ['PATH', process.env['PATH'] ?? ''],
      ['PWD', ''],
      ['SHLVL', 'custom-level'],
      ['_', 'exact-underscore'],
      ['__proto__', 'exact-proto'],
      ['constructor', 'exact-constructor'],
      ['PRIVATE_CANARY', secret],
      ...Array.from({ length: 48 }, (_, index): [string, string] => [
        'BULK_' + String(index),
        'x'.repeat(8192),
      ]),
    ]);
    if (scenario === 'payload-preload') {
      const preload = join(root, 'payload-preload.mjs');
      writeFileSync(
        preload,
        'await Bun.write(' +
          JSON.stringify(join(root, 'payload-preloaded')) +
          ', String(process.pid));',
      );
      values['BUN_OPTIONS'] = '--preload ' + JSON.stringify(preload);
      values['BUN_INSPECT_PRELOAD'] = preload;
      values['NODE_OPTIONS'] = '--no-warnings';
      values['BUN_BE_BUN'] = '1';
    }
    if (scenario === 'absent-specials')
      for (const key of ['PWD', 'SHLVL', '_']) Reflect.deleteProperty(values, key);
    if (scenario === 'empty-specials') for (const key of ['PWD', 'SHLVL', '_']) values[key] = '';
    let frame = encodeGatedEnvironment(values);
    function frameBody(body: Uint8Array): Uint8Array {
      const bytes = new Uint8Array(4 + body.byteLength);
      new DataView(bytes.buffer).setUint32(0, body.byteLength, false);
      bytes.set(body, 4);
      return bytes;
    }
    if (scenario === 'bad-env-duplicate')
      frame = frameBody(
        new TextEncoder().encode(
          JSON.stringify([
            1,
            [
              ['PRIVATE_CANARY', secret],
              ['PRIVATE_CANARY', secret],
            ],
          ]),
        ),
      );
    if (scenario === 'bad-env-utf8') frame = frameBody(new Uint8Array([0xff]));
    if (scenario === 'bad-env-json') frame = frameBody(new TextEncoder().encode('[' + secret));
    if (scenario === 'bad-env-version')
      frame = frameBody(new TextEncoder().encode(JSON.stringify([2, []])));
    if (scenario === 'bad-env-oversize') {
      frame = new Uint8Array(4);
      new DataView(frame.buffer).setUint32(0, 8388609, false);
    }
    if (scenario === 'bad-env-trailing') {
      const trailing = new Uint8Array(frame.byteLength + 1);
      trailing.set(frame);
      frame = trailing;
    }
    if (scenario === 'bad-env-partial') frame = frame.subarray(0, 17);
    const chunks: Buffer[] = [];
    statusSocket.on('data', (chunk: Buffer) => chunks.push(chunk));
    const statusEnded = once(statusSocket, 'end');
    const write = (socket: Socket, bytes: Uint8Array | string) =>
      new Promise<void>((resolve, reject) =>
        socket.write(bytes, (cause) => {
          if (cause) reject(cause);
          else resolve();
        }),
      );
    if (scenario === 'bad-control') await write(controlSocket, ' start\n');
    else {
      await write(controlSocket, 'st');
      await write(controlSocket, 'art\n');
    }
    const startupRefusal =
      scenario === 'cancel' ||
      scenario.startsWith('bad-env-') ||
      scenario === 'bad-control' ||
      scenario === 'pre-signal';
    if (scenario === 'pre-signal') {
      while (
        (parseInt(
          /^flags:\s+([0-7]+)/mu.exec(
            readFileSync('/proc/' + String(helperPid) + '/fdinfo/3', 'utf8'),
          )?.[1] ?? '0',
          8,
        ) &
          2048) ===
        0
      )
        await Bun.sleep(5);
      helper.kill('SIGINT');
      environmentSocket.end();
      controlSocket.end();
    } else if (scenario === 'cancel') {
      await write(environmentSocket, frame.subarray(0, 17));
      controlSocket.end();
    } else {
      if (startupRefusal) {
        if (scenario !== 'bad-control') await write(environmentSocket, frame);
      } else {
        await write(environmentSocket, frame.subarray(0, 2));
        await write(environmentSocket, frame.subarray(2));
      }
      await Bun.sleep(40);
      if (existsSync(join(root, 'payload.json'))) throw new Error('spawn before environment EOF');
      environmentSocket.end();
      if (scenario === 'queued-before-transition') {
        while (!existsSync(join(root, 'before-final-poll'))) await Bun.sleep(1);
        await write(controlSocket, 'done\n');
        writeFileSync(join(root, 'release-final-poll'), 'released');
      }
      if (
        [
          'early-done',
          'duplicate-start',
          'group-TERM',
          'group-INT',
          'group-HUP',
          'wrapper-TERM',
          'controller-eof',
        ].includes(scenario)
      ) {
        while (!existsSync(join(root, 'payload.json'))) await Bun.sleep(5);
        if (scenario === 'early-done' || scenario === 'duplicate-start')
          await write(controlSocket, scenario === 'early-done' ? 'done\n' : 'start\n');
        else if (scenario.startsWith('group-')) process.kill(-helperPid, 'SIG' + scenario.slice(6));
        else if (scenario === 'wrapper-TERM') helper.kill('SIGTERM');
        else controlSocket.end();
        await Bun.sleep(20);
        if (helper.exitCode !== null) throw new Error('signal/control command ended live keeper');
        writeFileSync(join(root, 'release-payload'), 'release');
      }
    }
    await statusEnded;
    if (scenario === 'environment-close-fault') {
      await Bun.sleep(30);
      if (helper.exitCode !== null)
        throw new Error('ambiguous required close released helper ownership');
      helper.kill('SIGKILL');
    }
    const statusAt = performance.now();
    const reported = Buffer.concat(chunks).toString('utf8');
    if (!startupRefusal && scenario !== 'environment-close-fault') {
      await Bun.sleep(30);
      if (scenario !== 'controller-eof' && helper.exitCode !== null)
        throw new Error('keeper ended before controller acknowledgement');
      if (
        !['early-done', 'duplicate-start', 'controller-eof', 'queued-before-transition'].includes(
          scenario,
        )
      )
        await write(controlSocket, 'done\n');
      controlSocket.end();
    }
    if (startupRefusal) controlSocket.end();
    environmentSocket.destroy();
    const ending: unknown = await ended;
    if (!Array.isArray(ending)) throw new Error('native ending is not an array');
    const code: unknown = ending[0],
      signal: unknown = ending[1];
    if (
      (code !== null && (typeof code !== 'number' || !Number.isInteger(code))) ||
      (signal !== null && typeof signal !== 'string')
    )
      throw new Error('invalid native ending');
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        code,
        signal,
        reported,
        afterStatusMs: performance.now() - statusAt,
        secretHash: createHash('sha256').update(secret).digest('hex'),
        frameLength: frame.byteLength,
      }),
    );
  }
} else throw new Error('unknown fixture role');
