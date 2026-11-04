import { createHash } from 'node:crypto';
import { chmod, chown, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';

import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { corruptRegistryPermit, registryPermitFaults } from './registry-permit-faults.fixture';
import { createRegistryPermitHttpProbe } from './registry-permit-http.fixture';

const script = '/etc/puni/registry-fixture-startup.sh';
const checksum = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const markers = [
  '.inject-open-failure',
  '.checksum-completed',
  '.permit-open-ready',
  '.permit-open-released',
  '.permit-next-poll',
  '.permit-next-poll-released',
] as const;

/** Original guard refusals and targeted HTTP202 removal witnesses in the owned private root namespace. Journal/permission are deliberately synthetic before any authority initialization. Grammar and actual no-renewal expiry are separately selected bounded workloads. Each terminates its namespace; synthetic journal/probe files remain for exact outer filesystem teardown. No authority is initialized, and this is not checker-process-death or installed controller proof. */
export async function proveRegistryPermitGuard(mode: 'grammar' | 'expiry'): Promise<void> {
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    deadline.abort(new Error('Owned guard proof deadline'));
  }, 120000);
  let guard: Awaited<ReturnType<typeof startRegistryFixtureGuard>> | undefined;
  let currentCase:
    | (typeof registryPermitFaults)[number]
    | 'setup'
    | 'final-open-failure'
    | 'removed-final-open-propagation'
    | 'missing-permit'
    | 'hash-position'
    | 'wrong-mode'
    | 'wrong-owner'
    | 'removed-byte-guard'
    | 'expiry'
    | 'removed-expiry'
    | 'checksum-mismatch'
    | 'removed-checksum'
    | 'final-verification' = 'setup';
  let step:
    | 'prepare'
    | 'issue'
    | 'remove-permit'
    | 'start'
    | 'stop'
    | 'http'
    | 'marker'
    | 'mutation'
    | 'inject'
    | 'release'
    | 'missing-open-diagnostic'
    | 'corrupt-record'
    | 'restart'
    | 'expire'
    | 'verify' = 'prepare';
  const probe = createRegistryPermitHttpProbe(deadline.signal);
  let openReady = false;
  let nextPoll = false;
  let missingOpenDiagnostic: boolean | null = null;
  // Boundary: The diagnostic callback updates this internal flag before the outer failure observer runs.
  let diagnosticEmitted = false as boolean;
  // Closed fixture state only: never serialize the caught error, stderr, paths or permission bytes.
  const diagnose = () => {
    diagnosticEmitted = true;
    const { lastHttp, expectedHttp } = probe.readObservation();
    console.log(
      JSON.stringify({
        guardFailure: {
          mode,
          currentCase,
          step,
          lastHttp,
          expectedHttp,
          openReady,
          nextPoll,
          missingOpenDiagnostic,
          deadlineAborted: deadline.signal.aborted,
        },
      }),
    );
  };
  try {
    const { installed } = await prepareRegistryHostFixture();
    const permission = installed.journalPath + '/writable.permit';
    const journal = installed.journalPath + '/journal.json';
    for (const path of [permission, journal, installed.journalPath + '/authority.lock']) {
      try {
        await lstat(path);
        throw new Error('Guard-only proof cannot replace initialized authority');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    }
    const metadata = await lstat(script);
    if (
      !metadata.isFile() ||
      metadata.uid !== 0 ||
      metadata.gid !== 0 ||
      (metadata.mode & 0o7777) !== 0o644 ||
      metadata.nlink !== 1
    )
      throw new Error('Wrong owned guard source metadata');
    const original = await readFile(script, 'utf8');
    await writeFile(journal, '{"schemaVersion":2,"fenced":false}\n', { mode: 0o600, flag: 'wx' });
    await chown(journal, 59001, 59001);
    await writeFile(
      '/etc/puni/ordinary-writer.json',
      JSON.stringify({
        version: 0.1,
        log: { level: 'error' },
        storage: {
          filesystem: { rootdirectory: installed.ordinary.path },
          delete: { enabled: false },
          maintenance: { uploadpurging: { enabled: false } },
        },
        http: { addr: '127.0.0.1:5052', secret: 'owned-guard-proof' },
      }),
      { mode: 0o644, flag: 'wx' },
    );
    await mkdir('/etc/puni/guard-proof-bin', { mode: 0o755 });
    const waitFor = `wait_for() {\n attempts=0\n while ! test -f "$1"; do\n  attempts=$((attempts+1));test "$attempts" -le 100 || exit 1\n  sleep .1\n done\n}\n`;
    await writeFile(
      '/etc/puni/guard-proof-bin/stat',
      `#!/bin/sh\nset -eu\n${waitFor}if test "$#" -eq 3 && test "$1" = -c; then
 if test "$3" = /registry-journal/contents/writable.permit && test -f /var/lib/registry/.permit-open-released; then
  : > /var/lib/registry/.permit-next-poll
  wait_for /var/lib/registry/.permit-next-poll-released
 fi
 if test "$3" = /registry-journal/contents/journal.json && test -f /var/lib/registry/.inject-open-failure && test -f /var/lib/registry/.checksum-completed; then
  metadata=$(/usr/bin/stat "$@") || exit 1
  : > /var/lib/registry/.permit-open-ready
  wait_for /var/lib/registry/.permit-open-released
  printf '%s\\n' "$metadata"
  exit 0
 fi
fi
exec /usr/bin/stat "$@"
`,
      { mode: 0o755, flag: 'wx' },
    );
    await writeFile(
      '/etc/puni/guard-proof-bin/sha256sum',
      `#!/bin/sh
set -eu
checksum=$(/usr/bin/sha256sum "$@") || exit 1
if test -f /var/lib/registry/.inject-open-failure; then : > /var/lib/registry/.checksum-completed; fi
printf '%s\\n' "$checksum"
`,
      { mode: 0o755, flag: 'wx' },
    );
    const clock = async () => {
      const bytes = await readFile('/proc/uptime', 'utf8');
      if (bytes.length > 128 || !/^\d+\.\d+ \d+\.\d+\n$/.test(bytes))
        throw new Error('Unknown owned guard clock');
      return Number(bytes.split(' ')[0]);
    };
    const issue = async () => {
      step = 'issue';
      const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
      if (!/^[0-9a-f-]{36}$/.test(boot)) throw new Error('Unknown owned guard boot');
      const issued = Math.floor(await clock());
      const hash = checksum(await readFile(journal));
      const record = Buffer.from(
        `1 ${boot} ${String(issued)} ${String(issued + 30)} ${hash} ${hash}\n`,
      );
      await writeFile(permission, record, { mode: 0o600 });
      await chown(permission, 59001, 59001);
      await chmod(permission, 0o600);
      return { record, expires: issued + 30 };
    };
    const missing = async () => {
      step = 'remove-permit';
      try {
        await unlink(permission);
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    };
    const start = async (
      initialMode: 'readonly' | 'writable' = 'readonly',
      interceptPermissionReads = false,
    ) => {
      step = 'start';
      deadline.signal.throwIfAborted();
      if (guard !== undefined) throw new Error('Owned guard already active');
      guard = await startRegistryFixtureGuard(installed, {
        signal: deadline.signal,
        initialMode,
        interceptPermissionReads,
      });
    };
    const stop = async () => {
      step = 'stop';
      if (guard !== undefined) {
        await guard.close();
        guard = undefined;
      }
    };
    const http = (expected: 202 | 405) => {
      step = 'http';
      return probe.awaitStatus(expected);
    };
    const marker = async (name: (typeof markers)[number]) => {
      step = 'marker';
      const end = Date.now() + 8000;
      for (;;) {
        deadline.signal.throwIfAborted();
        try {
          const status = await lstat(installed.ordinary.path + '/' + name);
          if (!status.isFile() || status.nlink !== 1 || status.size !== 0)
            throw new Error('Unknown owned guard marker');
          if (name === '.permit-open-ready') openReady = true;
          if (name === '.permit-next-poll') nextPoll = true;
          return;
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        }
        if (Date.now() >= end) throw new Error('Owned guard boundary missing');
        await Bun.sleep(20);
      }
    };
    const variant = async (before: string, after: string) => {
      step = 'mutation';
      if (guard !== undefined || original.split(before).length !== 2)
        throw new Error('Guard mutation boundary differs');
      await writeFile(script, original.replace(before, after));
    };
    const report = (name: string) => {
      console.log(
        JSON.stringify({
          guardCase: name,
          http: 'verified',
          scope: 'synthetic-journal-permit/actual-root59001-Distribution',
        }),
      );
    };
    try {
      if (mode === 'grammar') {
        for (const removed of [false, true]) {
          currentCase = removed ? 'removed-final-open-propagation' : 'final-open-failure';
          openReady = false;
          nextPoll = false;
          missingOpenDiagnostic = null;
          await missing();
          if (removed) await variant('  } 3< "$permission" || return 1', '  } 3< "$permission"');
          await start('readonly', true);
          await http(405);
          await issue();
          await http(202);
          step = 'inject';
          await writeFile(installed.ordinary.path + '/.inject-open-failure', '', { mode: 0o644 });
          await marker('.permit-open-ready');
          await missing();
          step = 'release';
          await writeFile(installed.ordinary.path + '/.permit-open-released', '', { mode: 0o644 });
          await marker('.permit-next-poll');
          await http(removed ? 202 : 405);
          const active = guard;
          if (active === undefined) throw new Error('Missing observed guard');
          await writeFile(installed.ordinary.path + '/.permit-next-poll-released', '', {
            mode: 0o644,
          });
          await stop();
          step = 'missing-open-diagnostic';
          const errors = active.readErrors();
          missingOpenDiagnostic =
            errors.includes('/registry-journal/contents/writable.permit') &&
            errors.includes('No such file');
          if (!missingOpenDiagnostic) throw new Error('Actual missing-open diagnostic absent');
          report(removed ? 'removed-final-open-propagation' : 'final-open-failure');
          for (const name of markers) await unlink(installed.ordinary.path + '/' + name);
          await writeFile(script, original);
        }
        currentCase = 'missing-permit';
        await missing();
        await start();
        await http(405);
        for (const fault of registryPermitFaults) {
          currentCase = fault;
          const { record } = await issue();
          await http(202);
          step = 'corrupt-record';
          await writeFile(permission, corruptRegistryPermit(fault, record));
          await http(405);
          if (fault === 'trailing-content') {
            await stop();
            await start();
            await http(405);
          }
          report(fault);
        }
        for (const position of [4, 5]) {
          currentCase = 'hash-position';
          const { record } = await issue();
          const fields = record.toString('ascii').trim().split(' ');
          fields[position] = '0'.repeat(64);
          await writeFile(permission, fields.join(' ') + '\n');
          await http(202);
          await writeFile(permission, fields.join(' ') + '\nCORRUPT\n');
          await http(405);
          report('valid-hash-position-' + String(position));
        }
        currentCase = 'wrong-mode';
        await issue();
        await http(202);
        await chmod(permission, 0o644);
        await http(405);
        report('wrong-permission-mode');
        currentCase = 'wrong-owner';
        await issue();
        await http(202);
        await chown(permission, 0, 0);
        await http(405);
        report('wrong-permission-owner');
        await stop();
        for (const fault of ['trailing-content', 'blank-second-line', 'double-space'] as const) {
          currentCase = 'removed-byte-guard';
          const before =
            fault === 'double-space'
              ? '  test "$record" = "1 $boot $issued $expires $first $second" || return 1'
              : '    test "${#record}" -eq "$((size - 1))" || return 1';
          await variant(before, '  :');
          await missing();
          await start();
          const { record } = await issue();
          await writeFile(permission, corruptRegistryPermit(fault, record));
          await http(202);
          await stop();
          report('removed-' + fault);
          await writeFile(script, original);
        }
      } else {
        currentCase = 'expiry';
        await missing();
        await start();
        await http(405);
        const { expires } = await issue();
        await http(202);
        step = 'expire';
        while ((await clock()) < expires) {
          deadline.signal.throwIfAborted();
          await Bun.sleep(100);
        }
        await http(405);
        await stop();
        await start();
        await http(405);
        await stop();
        report('actual-no-renewal-expiry-and-restart');
        currentCase = 'removed-expiry';
        await variant('$3 > $6', '1');
        await start('writable');
        await http(202);
        await stop();
        report('removed-expiry');
        await writeFile(script, original);
        await start();
        await http(405);
        await issue();
        await http(202);
        currentCase = 'checksum-mismatch';
        step = 'corrupt-record';
        await writeFile(journal, (await readFile(journal, 'utf8')) + ' ');
        await http(405);
        await stop();
        report('stable-checksum-mismatch');
        currentCase = 'removed-checksum';
        await variant(
          'if test "$checksum" = "$first" || test "$checksum" = "$second"; then',
          'if true; then',
        );
        await start('writable');
        await http(202);
        await stop();
        report('removed-checksum-match');
        await writeFile(script, original);
      }
      currentCase = 'final-verification';
      step = 'verify';
      if (guard !== undefined) throw new Error('Owned guard still active');
      if (checksum(await readFile(script)) !== checksum(original))
        throw new Error('Owned guard source not restored');
      console.log(
        JSON.stringify({
          guardRegression: mode,
          uploads: probe.readObservation().uploads,
          sourceRestored: true,
          allOwnedGuardsTerminal: true,
          authorityInitialized: false,
          disposal: 'entire-owned-namespace-and-filesystems-by-outer',
          scope:
            'guard-only; no actual checker death, authority update, Docker engine or installed-control-plane claim',
        }),
      );
    } catch (cause) {
      diagnose();
      throw cause;
    } finally {
      await stop();
      await writeFile(script, original);
    }
  } catch (cause) {
    if (!diagnosticEmitted) diagnose();
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
