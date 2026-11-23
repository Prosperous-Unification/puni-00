import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { createConnection } from 'node:net';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

interface Request {
  readonly command: 'dev-ports';
  readonly action: 'resolve' | 'check' | 'release';
  readonly repository: string;
  readonly appsDirectory?: string;
  readonly pairs: readonly string[];
}
interface Context {
  readonly callerDirectory: string;
  readonly lookup: { readonly directory: string; readonly path: string | undefined };
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly stdout: (bytes: string | Uint8Array) => void;
  readonly stderr: (bytes: string | Uint8Array) => void;
}
function hasCode(cause: unknown, code: string): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === code;
}
function readTool(name: string, path: string | undefined, directory: string): string | undefined {
  if (path === undefined) return undefined;
  for (const entry of path.split(delimiter)) {
    const candidate = join(isAbsolute(entry) ? entry : resolve(directory, entry), name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return realpathSync.native(candidate);
    } catch (cause) {
      if (hasCode(cause, 'ENOENT') || hasCode(cause, 'ENOTDIR') || hasCode(cause, 'EACCES'))
        continue;
      throw cause;
    }
  }
  return undefined;
}
/** Fixed external inspection only; no shell, caller command body or asynchronous child survives return. */
function inspectProcess(
  executable: string,
  args: readonly string[],
  directory: string,
  path: string | undefined,
): string {
  const child = Bun.spawnSync([executable, ...args], {
    cwd: directory,
    env: { PATH: path, LC_ALL: 'C', LANG: 'C' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
  if (
    child.signalCode !== undefined ||
    child.exitedDueToTimeout === true ||
    child.exitedDueToMaxBuffer === true
  )
    throw new Error('dev-port process inspection did not finish normally');
  if (
    child.exitCode !== 0 &&
    !(child.exitCode === 1 && child.stdout.length === 0 && child.stderr.length === 0)
  )
    throw new Error('dev-port process inspection failed: ' + child.stderr.toString());
  return child.stdout.toString();
}
/** Observe only IPv4 loopback. Refused connections mean unserved; unknown errors/timeouts refuse. */
function isServed(port: number): Promise<boolean> {
  return new Promise((resolveProbe, rejectProbe) => {
    let observed: { readonly served: boolean } | { readonly cause: unknown } | undefined;
    const socket = createConnection({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      observed ??= { cause: new Error('dev-port IPv4 probe timed out') };
      socket.destroy();
    }, 2000);
    socket.once('connect', () => {
      observed ??= { served: true };
      socket.destroy();
    });
    socket.once('error', (cause: unknown) => {
      observed ??= hasCode(cause, 'ECONNREFUSED') ? { served: false } : { cause };
      socket.destroy();
    });
    socket.once('close', () => {
      clearTimeout(timer);
      if (observed === undefined)
        rejectProbe(new Error('dev-port probe closed without an observation'));
      else if ('cause' in observed)
        rejectProbe(new Error('dev-port IPv4 probe failed', { cause: observed.cause }));
      else resolveProbe(observed.served);
    });
  });
}
function readConfiguredPairs(
  apps: string,
  environment: Readonly<Record<string, string | undefined>>,
  warn: (text: string) => void,
): string[] {
  const pairs: string[] = [];
  for (const tier of ['be-01', 'gw-01', 'mcp-01']) {
    const file = join(apps, tier, '.env');
    let contents: string;
    try {
      contents = readFileSync(file, 'utf8');
    } catch (cause) {
      if (hasCode(cause, 'ENOENT')) {
        warn(tier + ': no ' + file + ', so it has no configured port to check\n');
        continue;
      }
      // Proof: D07-counter-successor changed this throw to continue; the actual permission-denied
      // file control first failed at frontend accepts2 versus1. Exact restoration passed. Only this
      // before-next-probe property is proved; status/diagnostic assertions were unreached in the fault.
      throw new Error('unreadable environment file: ' + file, { cause });
    }
    let port: string | undefined;
    for (const line of contents.split('\n')) {
      const match = /^PORT=([0-9]+)[\t\v\f\r ]*$/u.exec(line);
      if (match !== null) port = match[1];
    }
    if (port === undefined)
      warn(tier + ': ' + file + ' sets no PORT, so it has no configured port to check\n');
    else pairs.push(tier + ':' + port);
  }
  const frontend = environment['PORT'];
  pairs.push('fe-01:' + (frontend === undefined || frontend === '' ? '4200' : frontend));
  return pairs;
}
function readListener(
  lsof: string,
  port: number,
  directory: string,
  path: string | undefined,
): number | undefined {
  const records = inspectProcess(
    lsof,
    ['-nP', '-i4TCP:' + String(port), '-sTCP:LISTEN', '-Fpn'],
    directory,
    path,
  );
  let current: number | undefined;
  const pids = new Set<number>();
  for (const line of records.split('\n')) {
    if (line === '') continue;
    if (line.startsWith('p')) {
      const raw = line.slice(1);
      if (!/^[1-9][0-9]*$/u.test(raw) || !Number.isSafeInteger(Number(raw)))
        throw new Error('lsof returned an invalid listener PID');
      current = Number(raw);
    } else if (line.startsWith('n')) {
      if (current === undefined) throw new Error('lsof listener address has no PID');
      const address = line.slice(1);
      if (
        address === '127.0.0.1:' + String(port) ||
        address === '*:' + String(port) ||
        address === '0.0.0.0:' + String(port)
      )
        pids.add(current);
    } else if (!line.startsWith('f')) throw new Error('lsof returned an unknown listener field');
  }
  return [...pids].sort((left, right) => left - right)[0];
}
function isWithin(root: string, directory: string): boolean {
  const offset = relative(root, directory);
  return (
    offset === '' || (offset !== '..' && !offset.startsWith('..' + sep) && !isAbsolute(offset))
  );
}
/**
 * Embedded development-port resolution, IPv4 preflight and explicit checkout-owned release.
 * Captures caller/request inputs before waits; no installed-artifact path or Git root is inferred.
 * Release requires lsof, retains the first PID and rechecks current listener/cwd before each signal.
 * Polling/socket absence decides completion, never signal-delivery success. This is not an atomic
 * PID capability or an IPv6/free-bind guarantee. External inspection remains an explicit trust premise.
 */
export async function runDevPorts(request: Request, context: Context): Promise<number> {
  const selected = { ...request, pairs: [...request.pairs] };
  const environment = { ...context.environment };
  const lookup = { ...context.lookup };
  const callerDirectory = context.callerDirectory;
  const write = context.stdout,
    warn = context.stderr;
  const repository = realpathSync.native(resolve(callerDirectory, selected.repository));
  if (!statSync(repository).isDirectory())
    throw new Error('development repository is not a directory');
  const apps =
    selected.appsDirectory === undefined
      ? join(repository, 'apps/wbs')
      : resolve(callerDirectory, selected.appsDirectory);
  if (selected.action === 'resolve') {
    if (selected.pairs.length !== 0) {
      warn('resolve does not accept explicit port pairs\n');
      return 2;
    }
    for (const pair of readConfiguredPairs(apps, environment, warn)) write(pair + '\n');
    return 0;
  }
  const override = environment['WBS_DEV_PORTS'];
  const pairs =
    selected.pairs.length > 0
      ? selected.pairs
      : override === undefined
        ? readConfiguredPairs(apps, environment, warn)
        : override.split(/[\t\n ]+/u).filter((word) => word !== '');
  if (selected.pairs.length === 0 && override !== undefined && pairs.length === 0)
    warn('WBS_DEV_PORTS is set and empty: no dev port is being checked\n');
  const addressed: { tier: string; port: number }[] = [];
  for (const pair of pairs) {
    const match = /^([^:]+):([0-9]+)$/u.exec(pair);
    const tier = match?.[1],
      port = match === null ? NaN : Number(match[2]);
    if (tier === undefined || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
      warn('malformed <tier>:<port> pair: ' + pair + '\n');
      return 2;
    }
    addressed.push({ tier, port });
  }
  const lsof = readTool('lsof', lookup.path, lookup.directory);
  if (selected.action === 'release' && lsof === undefined) {
    warn("no lsof on PATH: cannot tell this checkout's processes from anybody else's\n");
    warn(
      'refusing to kill anything. macOS: brew install lsof. Debian/Ubuntu: apt-get install lsof\n',
    );
    return 1;
  }
  let served = 0,
    refused = 0;
  for (const { tier, port } of addressed) {
    if (!(await isServed(port))) continue;
    served += 1;
    if (selected.action === 'check') {
      warn(tier + ' cannot start: port ' + String(port) + ' is already being served\n');
      if (lsof === undefined) warn('    no lsof on PATH, so the process cannot be named here\n');
      else {
        const pid = readListener(lsof, port, repository, lookup.path);
        if (pid === undefined) warn('    the port answered but nothing is listening on it now\n');
        else {
          warn('    held by pid ' + String(pid) + '\n');
          warn('    free it with: kill ' + String(pid) + '\n');
        }
      }
      continue;
    }
    if (lsof === undefined) throw new Error('release lost its retained lsof tool');
    const pid = readListener(lsof, port, repository, lookup.path);
    if (pid === undefined) {
      warn(
        tier +
          ': port ' +
          String(port) +
          ' answers but no listener can be named; killing nothing\n',
      );
      refused++;
      continue;
    }
    const authorizeSignal = (): boolean => {
      if (readListener(lsof, port, repository, lookup.path) !== pid) return false;
      const lines = inspectProcess(
        lsof,
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
        repository,
        lookup.path,
      )
        .split('\n')
        .filter((line) => line.startsWith('n'));
      if (lines.length !== 1)
        throw new Error('cannot read the working directory of pid ' + String(pid));
      const cwd = lines.at(0)?.slice(1);
      if (cwd === undefined || cwd === '') throw new Error('listener working directory is empty');
      if (!isWithin(repository, cwd)) {
        warn(
          tier +
            ': port ' +
            String(port) +
            ' is held by pid ' +
            String(pid) +
            ' from ' +
            cwd +
            ', which is not this checkout\n',
        );
        return false;
      }
      return true;
    };
    if (!authorizeSignal()) {
      refused++;
      continue;
    }
    const signalListener = (name: 'SIGTERM' | 'SIGKILL') => {
      try {
        process.kill(pid, name);
      } catch (cause) {
        if (!hasCode(cause, 'ESRCH')) throw cause;
      }
    };
    signalListener('SIGTERM');
    let waiting = 0;
    while (await isServed(port)) {
      if (waiting++ >= 50) break;
      await Bun.sleep(100);
    }
    if (await isServed(port)) {
      if (!authorizeSignal()) {
        refused++;
        continue;
      }
      warn(
        tier +
          ': pid ' +
          String(pid) +
          ' kept port ' +
          String(port) +
          ' through SIGTERM; sending SIGKILL\n',
      );
      signalListener('SIGKILL');
    }
    waiting = 0;
    while (await isServed(port)) {
      if (waiting++ >= 50) break;
      await Bun.sleep(100);
    }
    if (await isServed(port)) {
      warn(tier + ': port ' + String(port) + ' is still served after release\n');
      refused++;
    } else write(tier + ': freed port ' + String(port) + ' (was pid ' + String(pid) + ')\n');
  }
  if (selected.action === 'release') {
    if (served === 0) write('every dev port is already free\n');
    if (refused > 0) {
      warn(String(refused) + ' port(s) are still served\n');
      return 1;
    }
    return 0;
  }
  if (served > 0) {
    warn('refusing to start the dev stack with ' + String(served) + ' port(s) already served\n');
    return 1;
  }
  return 0;
}
