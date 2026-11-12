import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';

import type { Admission } from '@shared/heavy-lock';

import { type GateAdmission, readGateAdmission } from './gate-admission';
import { readTermination } from './native-exit';

export interface Request {
  readonly tree: string;
  /** Full immutable commit already resolved by the caller, before waiting for admission. */
  readonly commit: string;
  readonly settle: 'keep' | 'restore';
  readonly repairModes: boolean;
}
export interface Scope {
  /** Track an actual direct child through error-free native termination and numeric correspondence. */
  runChild(argv: readonly [string, ...string[]]): Promise<number>;
}
export interface Failure {
  readonly phase: 'checkout' | 'work' | 'restore' | 'report' | 'cleanup';
  readonly cause: unknown;
}
export interface Completion {
  readonly status: number;
  readonly failures: readonly Failure[];
}
export interface CheckoutContext {
  readonly gitExecutable: string;
  readonly lookupPath: string;
  readonly reportAdmission: (admission: Admission) => Promise<void>;
  readonly reportHead: (commit: string) => Promise<void>;
  readonly reportFailure: (failure: Failure) => Promise<void>;
  readonly reportUnconfirmed: (observation: {
    readonly pid: number;
    readonly cause: unknown;
  }) => Promise<void>;
  /**
   * Trusted, already-loaded orchestration. Scope launches track direct children only. Await any
   * independently qualified facade's complete ownership before returning; neither a direct child
   * exit nor SIGKILL137 establishes descendant absence. Full installer/Nx/verifier subtree
   * ownership and protected-worker composition remain separate later gate slices.
   */
  readonly work: (scope: Scope) => Promise<number>;
}
/** Cancellation access borrowed from the executable facade; no disposal authority. */
export interface BorrowedControl {
  readonly signal: AbortSignal;
  readonly readStatus: () => 130 | 143;
}
class Refusal extends Error {
  constructor(
    readonly status: 64 | 65 | 66,
    message: string,
  ) {
    super(message);
  }
}
class Cancellation extends Error {
  constructor(readonly status: 130 | 143) {
    super('gate checkout cancelled before work');
  }
}
/** Service native signals queued by synchronous Git while admission and its handlers remain owned. */
export async function serviceInterrupts(): Promise<void> {
  await new Promise<undefined>((resume) => {
    setImmediate(() => {
      resume(undefined);
    });
  });
}
interface Entry {
  readonly path: string;
  readonly mode: string;
}
function decodeGit(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
}
function splitFrames(text: string): string[] {
  if (text === '') return [];
  // Proof: C33 G10 removed NUL termination refusal; `rejects incomplete NUL-framed tracked path scans before checkout` reached the checkout marker; restoration passed. This covers that tracked response ordering.
  if (!text.endsWith('\0')) throw new Error('Git pathname response is not NUL terminated');
  const frames = text.slice(0, -1).split('\0');
  if (frames.some((frame) => frame === ''))
    throw new Error('Git pathname response contains an empty frame');
  return frames;
}
function requirePath(path: string): void {
  if (
    path === '' ||
    isAbsolute(path) ||
    normalize(path) !== path ||
    path.split('/').some((part) => part === '..' || part === '.') ||
    path.includes('\0')
  )
    throw new Error('Git pathname is outside its tracked tree');
}
function readEntries(text: string): Entry[] {
  return splitFrames(text).map((frame) => {
    const match =
      /^(040000|100644|100755|120000|160000) (tree|blob|commit) ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/su.exec(
        frame,
      );
    const mode = match?.[1],
      path = match?.[4];
    if (mode === undefined || path === undefined) throw new Error('Git tree entry is malformed');
    // Proof: C33 G11 removed this tracked-entry traversal validation; `refuses tracked pathname traversal before repairing outside the tree` observed the foreign file change0600 to0644; restoration passed.
    requirePath(path);
    // Proof: C33 G07 removed gitlink refusal; `refuses gitlinks before candidate checkout` reached its candidate-checkout marker; restoration passed.
    if (mode === '160000') throw new Error('gate checkout does not support gitlinks');
    return { mode, path };
  });
}
function requireClean(text: string): void {
  const frames = splitFrames(text),
    paths: string[] = [];
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (!/^[ MADRCU?!]{2} /u.test(frame)) throw new Error('Git status frame is malformed');
    const path = frame.slice(3);
    requirePath(path);
    paths.push(path);
    if (frame.startsWith('R') || frame.startsWith('C') || frame[1] === 'R' || frame[1] === 'C') {
      index++;
      if (index >= frames.length) throw new Error('Git rename source is missing');
      requirePath(frames[index]);
    }
  }
  // Proof: C33 G12 removed dirty refusal; `refuses untracked dirty bytes65 without work or deletion` returned0 instead of65; restoration passed. Later preservation assertions were not reached.
  if (paths.length !== 0)
    throw new Refusal(
      65,
      'gate checkout is dirty: ' +
        String(paths.length) +
        ' paths; ' +
        JSON.stringify(paths.slice(0, 20)),
    );
}
function checkModes(tree: string, entries: readonly Entry[], repair: boolean): void {
  for (const entry of entries) {
    const path = join(tree, entry.path),
      file = lstatSync(path);
    if (entry.mode === '120000') {
      if (!file.isSymbolicLink()) throw new Error('tracked symlink changed type');
      continue;
    }
    const directory = entry.mode === '040000';
    // Proof: C33 M03 removed physical-kind refusal; `owned gate checkout kind-change under isolated Linux supervision` observed work entry for a replaced path kind; restoration passed.
    if (directory ? !file.isDirectory() : !file.isFile())
      throw new Error('tracked path changed type');
    const required = directory ? 0o005 : 0o004;
    if ((file.mode & required) === required && !repair) continue;
    if (repair) {
      const descriptor = openSync(
        path,
        constants.O_RDONLY |
          constants.O_NONBLOCK |
          constants.O_NOFOLLOW |
          (directory ? constants.O_DIRECTORY : 0),
      );
      const failures: unknown[] = [];
      try {
        const opened = fstatSync(descriptor);
        // Proof: C33 M04 removed descriptor identity binding; `binds mode repair to the originally inspected physical file before chmod` observed the foreign inode change0600 to0644; restoration passed.
        if (opened.dev !== file.dev || opened.ino !== file.ino)
          throw new Error('tracked path changed during mode repair');
        const execute = directory || (opened.mode & 0o111) !== 0 ? 0o011 : 0;
        // Proof: C33 M02 removed fchmod; `refuses private tracked file66 and opt-in repairs only tracked targets` and its directory peer returned66 instead of repair0; restoration passed.
        fchmodSync(descriptor, opened.mode | 0o044 | execute);
      } catch (cause) {
        // Proof: C33 M05 dropped the chmod observation cause; `preserves repair observation and actual descriptor-close causes independently` lost that cause while close still completed; restoration passed.
        failures.push(cause);
      }
      try {
        // Proof: C33 M07 removed close; `preserves repair observation and actual descriptor-close causes independently` observed the descriptor still open and the missing close cause; restoration passed.
        closeSync(descriptor);
      } catch (cause) {
        // Proof: C33 M06 dropped the close observation cause; `preserves repair observation and actual descriptor-close causes independently` lost that cause while the descriptor was closed; restoration passed.
        failures.push(cause);
      }
      if (failures.length !== 0) throw new AggregateError(failures, 'tracked mode repair failed');
    }
    // Proof: C33 M01 removed mode refusal; the `refuses private tracked` file and directory cases returned0 instead of66; restoration passed. Later unrelated-target assertions were not reached.
    if ((lstatSync(path).mode & required) !== required)
      throw new Refusal(66, 'tracked path is closed to other users: ' + JSON.stringify(entry.path));
  }
}
/**
 * Track one direct child under the operation-wide referenced owner. No direct native wait proves descendants absent: callers must keep
 * tree-owning work inside this child until its own descendants settle. A callback error or
 * missing identity keeps the referenced owner pending; reporting failure cannot release it.
 */
async function runChild(
  argv: readonly string[],
  directory: string,
  lookupPath: string,
  report: CheckoutContext['reportUnconfirmed'],
): Promise<number> {
  const terminal = Promise.withResolvers<number>(),
    failures: unknown[] = [];
  let ended = false,
    reporting: Promise<void> | undefined;
  let callbackCheck: ReturnType<typeof setTimeout> | undefined;
  function record(pid: number, cause: unknown): void {
    failures.push(cause);
    reporting ??= Promise.resolve()
      .then(() => report({ pid, cause }))
      .catch((failure: unknown) => {
        failures.push(failure);
      });
  }
  let observed: Promise<{ kind: 'status'; status: number } | { kind: 'failed'; cause: unknown }>,
    pid: number | undefined;
  try {
    const child = Bun.spawn([...argv], {
      cwd: directory,
      env: { PATH: lookupPath },
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      detached: false,
      onExit(native, code, signal, cause) {
        if (ended) return;
        // Proof: C33 C02 ignored native onExit error; `owned gate checkout unknown under isolated Linux supervision` observed owner exit after child end while completion remained unconfirmed; restoration passed. No later mutex assertion credit.
        if (cause !== undefined) {
          record(native.pid, cause);
          return;
        }
        const termination = readTermination(code, signal);
        // Proof: C33 C03 ignored malformed native identity; `owned gate checkout unknown-identity under isolated Linux supervision` observed premature owner exit; restoration passed. Numeric disagreement is not native authority.
        if (termination.kind === 'unconfirmed') {
          record(native.pid, termination.cause);
          return;
        }
        ended = true;
        terminal.resolve(termination.status);
      },
    });
    pid = child.pid;
    observed = child.exited.then(
      (status) => {
        if (!ended)
          callbackCheck = setTimeout(() => {
            // Proof: C33 C08 disabled this diagnostic; `owned gate checkout missing-callback under isolated Linux supervision` lost the unconfirmed marker after numeric end; restoration passed. Diagnostic only, never release authority.
            if (!ended)
              record(child.pid, new Error('gate child native termination callback is missing'));
          }, 1000);
        return { kind: 'status' as const, status };
      },
      (cause: unknown) => {
        record(child.pid, cause);
        return { kind: 'failed' as const, cause };
      },
    );
  } catch (cause) {
    // Proof: C33 C05 made post-spawn observer failure throw immediately; `owned gate checkout observer-throw under isolated Linux supervision` observed outcome before child end; restoration passed.
    if (pid === undefined) {
      throw cause;
    }
    record(pid, cause);
    observed = Promise.resolve({ kind: 'failed', cause });
  }
  try {
    // Proof: C33 C01 bypassed native wait; `owned gate checkout unknown under isolated Linux supervision` observed owner exit after real child end while native completion was unconfirmed; restoration passed.
    const status = await terminal.promise;
    if (callbackCheck !== undefined) clearTimeout(callbackCheck);
    const expiry = Promise.withResolvers<{ kind: 'failed'; cause: unknown }>();
    const timer = setTimeout(() => {
      expiry.resolve({
        kind: 'failed',
        cause: new Error('gate child numeric status did not settle after native end'),
      });
    }, 1000);
    let numeric: Awaited<typeof observed>;
    try {
      numeric = await Promise.race([observed, expiry.promise]);
    } finally {
      clearTimeout(timer);
    }
    // Proof: C33 C04 removed numeric correspondence; `owned gate checkout false-failure under isolated Linux supervision` accepted actual native0/exposed37 as0 instead of70; restoration passed.
    if (numeric.kind === 'failed') failures.push(numeric.cause);
    else if (numeric.status !== status)
      failures.push(new Error('gate child native exit identities disagree'));
    if (reporting !== undefined) await reporting;
    if (failures.length !== 0) throw new AggregateError(failures, 'gate child observation failed');
    return status;
  } finally {
    if (callbackCheck !== undefined) clearTimeout(callbackCheck);
  }
}

/**
 * Run the transaction inside a genuine live admission. Trusted composition must await the complete
 * promise before its admission callback settles; token retirement cannot contain abandoned work.
 * The facade owns control and the synchronous nonthrowing completion capture. Capture occurs before
 * umask restoration so a later finalizer failure cannot discard an already settled completion.
 * @throws Invalid internal admission before transaction effects and modeled recovery.
 */
export async function runAdmittedCheckout(
  request: Request,
  context: CheckoutContext,
  control: BorrowedControl,
  token: GateAdmission,
  capture: (completion: Completion) => void,
): Promise<Completion> {
  const admission = readGateAdmission(token);
  const selected = { ...request },
    captured = { ...context },
    isCancelled = (): boolean => control.signal.aborted,
    readInterruptionStatus = control.readStatus;
  const captureCompletion = (value: Completion): Completion => {
    capture(value);
    return value;
  };
  // Proof: C33 G15 omitted GIT_NO_REPLACE_OBJECTS; `disables real replacement objects while verifying the same requested commit identity` read replacement poison instead of candidate bytes; restoration passed.
  const gitEnvironment = {
    PATH: captured.lookupPath,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_ALLOW_PROTOCOL: '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_LAZY_FETCH: '1',
  };
  function runGit(
    argv: readonly string[],
    allowed: readonly number[] = [0],
  ): { status: number; stdout: string } {
    // Proof: C33 G08/G09 changed hooksPath or removed only fsmonitor override; `disables actual configured checkout hooks and fsmonitor before status` observed the corresponding actual helper marker; both restorations passed.
    // Proof: C33 G14 merged process.env back into this Git call; `gives every Git child explicit cwd and excludes ambient caller configuration` observed the ambient sentinel; restoration passed. That fault does not prove cwd binding.
    const child = Bun.spawnSync(
      [
        captured.gitExecutable,
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        '-c',
        'submodule.recurse=false',
        '-C',
        selected.tree,
        ...argv,
      ],
      { cwd: selected.tree, env: gitEnvironment, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    );
    // Proof: C33 G03 bypassed this gate; `propagates required Git status scan failures before work` accepted exit41 as overall0; restoration passed. Exit-status arm only, not an independent signal-arm proof.
    if (child.signalCode !== undefined || !allowed.includes(child.exitCode))
      throw new Error('gate Git ' + JSON.stringify(argv) + ' failed: ' + child.stderr.toString());
    return { status: child.exitCode, stdout: decodeGit(child.stdout) };
  }
  const readHead = (): string => {
    const commit = runGit(['rev-parse', '--verify', 'HEAD^{commit}']).stdout.trim();
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(commit))
      throw new Error('Git HEAD is not a full commit');
    return commit;
  };
  function refuseFilters(): void {
    const filters = runGit(
      ['config', '--null', '--get-regexp', '^filter\\..*\\.(clean|smudge|process)$'],
      [0, 1],
    );
    if (filters.status === 1) {
      if (filters.stdout !== '') throw new Error('Git absent filters returned bytes');
      return;
    }
    for (const frame of splitFrames(filters.stdout)) {
      const separator = frame.indexOf('\n');
      if (separator < 1) throw new Error('Git filter config is malformed');
      // Proof: C33 G06 removed filter refusal; `refuses effective executable filters before Git status or candidate checkout` reached work; restoration passed. The helper-marker assertion passed, so no filter execution claim.
      if (frame.slice(separator + 1).trim() !== '')
        throw new Error('gate checkout refuses executable Git filters');
    }
  }
  // Proof: C33 U01 omitted022 selection; `creates readable candidate paths under022 and restores the caller umask` returned66 under incoming077; restoration passed. Preparation/status property.
  const previousUmask = process.umask(0o022);
  try {
    const failures: Failure[] = [];
    let status = 0,
      original: string | undefined,
      reference: string | undefined,
      attempted = false,
      hasRestorationFailed = false,
      hasRestorationAttempted = false;
    const record = (phase: Failure['phase'], cause: unknown): void => {
      failures.push({ phase, cause });
    };
    try {
      await captured.reportAdmission(admission);
      // Proof: C35 Task1b B05 bypassed early capture; the controlled umask-finalizer child exited1 and failed its first parent expected0 assertion; restored pass. Later receipt members are not independent credit.
      if (isCancelled()) return captureCompletion({ status: readInterruptionStatus(), failures });
      if (
        !isAbsolute(selected.tree) ||
        normalize(selected.tree) !== selected.tree ||
        realpathSync(selected.tree) !== selected.tree ||
        !isAbsolute(captured.gitExecutable) ||
        captured.lookupPath.split(':').some((segment) => !isAbsolute(segment)) ||
        !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(selected.commit)
      )
        throw new Refusal(
          64,
          'gate checkout requires canonical tree, absolute Git and full resolved SHA',
        );
      const version = /^git version (\d+)\.(\d+)\./u.exec(runGit(['--version']).stdout);
      // Proof: C33 G04 removed the version gate; `refuses an unsupported reported Git version before checkout or work` admitted reported2.35.0 as0; restoration passed. Other version clauses are not isolated proofs.
      if (
        version === null ||
        Number(version[1]) < 2 ||
        (Number(version[1]) === 2 && Number(version[2]) < 36)
      )
        throw new Error('gate checkout requires Git2.36 or newer');
      const workingTree = runGit(['rev-parse', '--show-toplevel']).stdout;
      // Proof: C33 G01/G02 removed root equality or trimmed framing; redirected/subdirectory or malformed-response cases reached unsafe-operation markers; restorations passed. See `binds the explicit tree` and `rejects working-tree malformed response`.
      if (workingTree !== selected.tree + '\n')
        throw new Error(
          'effective Git working-tree root does not match the selected canonical tree',
        );
      original = readHead();
      const symbolic = runGit(['symbolic-ref', '--quiet', 'HEAD'], [0, 1]);
      if (symbolic.status === 0) {
        reference = symbolic.stdout.trim();
        if (!reference.startsWith('refs/heads/'))
          throw new Error('Git original reference is not a local branch');
      } else if (symbolic.stdout !== '') throw new Error('detached Git reference returned bytes');
      const requested = runGit(
        ['rev-parse', '--verify', '--quiet', selected.commit + '^{commit}'],
        [0, 1],
      );
      if (requested.status !== 0)
        throw new Refusal(64, 'requested commit is not available in the admitted tree');
      const resolved = requested.stdout.trim();
      if (resolved !== selected.commit)
        throw new Refusal(64, 'requested commit resolved to another identity');
      refuseFilters();
      // Proof: C33 G13 removed original-tree scan; `refuses a gitlink only in the saved original before candidate checkout` reached candidate checkout; restoration passed.
      readEntries(runGit(['ls-tree', '-r', '-t', '-z', '--full-tree', original]).stdout);
      const entries = readEntries(
        runGit(['ls-tree', '-r', '-t', '-z', '--full-tree', selected.commit]).stdout,
      );
      requireClean(
        runGit([
          'status',
          '--porcelain=v1',
          '-z',
          '--untracked-files=all',
          '--ignore-submodules=all',
        ]).stdout,
      );
      attempted = true;
      runGit(['checkout', '--detach', '--quiet', selected.commit]);
      // Proof: C33 G05 removed actual-HEAD verification; `refuses a successful checkout response with the wrong actual HEAD` entered work; restoration passed.
      if (readHead() !== selected.commit)
        throw new Error('actual checked-out HEAD does not match requested SHA');
      requireClean(
        runGit([
          'status',
          '--porcelain=v1',
          '-z',
          '--untracked-files=all',
          '--ignore-submodules=all',
        ]).stdout,
      );
      checkModes(selected.tree, entries, selected.repairModes);
      await captured.reportHead(readHead());
      // Proof: C33 S03 removed this checkpoint; `owned gate checkout checkout-signal under isolated Linux supervision` entered work with the native interrupt queued; restoration passed.
      await serviceInterrupts();
      // Proof: C33 S02 removed cancellation refusal; `observes cancellation during reporting before starting work and restores` entered work; restoration passed.
      if (isCancelled()) throw new Cancellation(readInterruptionStatus());
      const children: Promise<
        { kind: 'status'; status: number } | { kind: 'failed'; cause: unknown }
      >[] = [];
      let isOpen = true;
      const scope: Scope = {
        runChild(argv) {
          // Proof: C33 C06 removed closed-scope refusal; `closes the child capability before releasing checkout ownership` admitted a late launch, which the fixture awaited before cleanup; restoration passed.
          if (!isOpen) throw new Error('gate child scope is closed');
          const pending = runChild(
            [...argv],
            selected.tree,
            captured.lookupPath,
            captured.reportUnconfirmed,
          );
          children.push(
            pending.then(
              (status) => ({ kind: 'status' as const, status }),
              (cause: unknown) => ({ kind: 'failed' as const, cause }),
            ),
          );
          return pending;
        },
      };
      try {
        status = await captured.work(scope);
        if (!Number.isInteger(status) || status < 0 || status > 255)
          throw new Error('gate work status is invalid');
        if (status !== 0) record('work', new Error('gate work exited ' + String(status)));
      } catch (cause) {
        status = 70;
        record('work', cause);
      } finally {
        isOpen = false;
        // Proof: C33 C07 skipped child settlement; `owned gate checkout return-early under isolated Linux supervision` observed outcome while a launched child remained pending; restoration passed. No later HEAD/mutex assertion credit.
        for (const child of children) {
          const observation = await child;
          // Proof: C33 C09 recorded child nonzero only when status was0; both `retains every independent child failure` cases lost later child evidence while primary status stayed correct; restoration passed.
          if (observation.kind === 'failed') {
            status = 70;
            record('work', observation.cause);
          } else if (observation.status !== 0) {
            if (status === 0) status = observation.status;
            record('work', new Error('gate child exited ' + String(observation.status)));
          }
        }
      }
      if (readHead() !== selected.commit) throw new Error('gate work moved the pinned HEAD');
    } catch (cause) {
      status = cause instanceof Refusal || cause instanceof Cancellation ? cause.status : 70;
      if (!(cause instanceof Cancellation)) record('checkout', cause);
    }
    await serviceInterrupts();
    if (isCancelled() && status === 0) status = readInterruptionStatus();
    function restoreIfRequired(): boolean {
      // Proof: C33 R01 disabled recovery; `runs the requested full commit under actual native ownership and restores its attached original` left candidate HEAD after work37; restoration passed. Later reference assertions were not reached.
      if (hasRestorationAttempted || !attempted || (selected.settle === 'keep' && status === 0))
        return false;
      // Proof: C33 R10 disabled this latch; `preserves restore primary and reporting causes across actual admission close failure` observed a second recovery/report cycle; restoration passed.
      hasRestorationAttempted = true;
      try {
        if (original === undefined) throw new Error('original gate commit was not captured');
        refuseFilters();
        let branchChanged = false;
        if (reference !== undefined) {
          const current = runGit(['rev-parse', '--verify', '--quiet', reference], [0, 1]);
          branchChanged = current.status !== 0 || current.stdout.trim() !== original;
        }
        const saved = original;
        function restoreDetached(): void {
          runGit(['checkout', '--detach', '--quiet', saved]);
          const detached = runGit(['symbolic-ref', '--quiet', 'HEAD'], [0, 1]);
          // Proof: C33 R02 removed detached-shape verification; `verifies detached original checkout shape independently of restored HEAD` accepted attached restoration as0 instead of74; restoration passed.
          if (detached.status !== 1 || detached.stdout !== '')
            throw new Error('gate saved commit was not restored detached');
          // Proof: C33 R03 removed saved-HEAD verification; `verifies restored HEAD independently of a successful restoration command` returned0 instead of74 for false restoration; restoration passed.
          if (readHead() !== saved) throw new Error('gate restoration HEAD differs from original');
        }
        if (reference === undefined || branchChanged) restoreDetached();
        else {
          try {
            restoreDetached();
            runGit(['symbolic-ref', 'HEAD', reference]);
            const attached = runGit(['symbolic-ref', '--quiet', 'HEAD'], [0, 1]);
            // Proof: C33 R04 removed the grouped attachment check; `verifies the original symbolic reference after restoration` accepted false attachment as0 instead of74; restoration passed. Its three clauses are not separate proofs.
            if (
              attached.status !== 0 ||
              attached.stdout.trim() !== reference ||
              readHead() !== saved
            )
              throw new Error('gate original reference was not restored exactly');
          } catch (cause) {
            const cleanupFailures: unknown[] = [cause];
            try {
              // Proof: C33 R06 removed detached fallback; `recovers saved detached commit when original branch moves during attachment` retained74 but had the wrong actual HEAD; restoration passed.
              restoreDetached();
            } catch (failure) {
              cleanupFailures.push(failure);
            }
            throw new AggregateError(
              cleanupFailures,
              'gate reference restoration failed; saved detached fallback attempted',
              { cause },
            );
          }
        }
        // Proof: C33 R05 removed final classification; `preserves moved original branch and saved detached commit74` returned work37 instead of74; restoration passed. This is not an isolated pre-attachment comparison proof.
        if (branchChanged)
          throw new Error(
            'original gate branch moved or disappeared; restored saved commit detached',
          );
      } catch (cause) {
        // Proof: C33 R07 disabled restoration-origin priority; `retains primary work and reporting causes when restoration fails74` returned70 instead of74; restoration passed.
        hasRestorationFailed = true;
        status = 74;
        record(
          'restore',
          new Error(
            'gate restoration failed; recover saved commit with ' +
              JSON.stringify([
                captured.gitExecutable,
                '-C',
                selected.tree,
                'checkout',
                '--detach',
                original,
              ]),
            { cause },
          ),
        );
      }
      return true;
    }
    restoreIfRequired();
    let reportedFailures = 0;
    async function reportFailures(): Promise<void> {
      const pending = failures.slice(reportedFailures);
      for (const failure of pending)
        try {
          await captured.reportFailure(failure);
        } catch (cause) {
          record('report', cause);
          // Proof: C33 R08 used numeric74 as restoration authority; `distinguishes work exit74 from restoration74 when required reporting fails` wrongly kept74 instead of70; restoration passed.
          if (!hasRestorationFailed) status = 70;
        }
      reportedFailures = failures.length;
    }
    await reportFailures();
    await serviceInterrupts();
    if (isCancelled() && status === 0) status = readInterruptionStatus();
    // Proof: C33 S08 skipped final admitted recovery; `final-signal` retained candidate HEAD and `final-error-signal` lost74; both native restorations passed. Recovery remains before callback capture.
    if (restoreIfRequired()) {
      await reportFailures();
      await serviceInterrupts();
      if (isCancelled() && status === 0) status = readInterruptionStatus();
    }
    // Proof: C35 Task1b B06 bypassed final capture; the controlled umask-finalizer child exited1 and failed its first parent expected0 assertion; restored pass. Later receipt members are not independent credit.
    return captureCompletion({ status, failures });
  } finally {
    // Proof: C33 U02 omitted umask restore; `creates readable candidate paths under022 and restores the caller umask` observed022 instead of original077; restoration passed.
    process.umask(previousUmask);
  }
}
