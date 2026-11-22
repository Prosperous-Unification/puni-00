import { spawn } from 'node:child_process';
import {
  closeSync,
  constants as files,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { constants, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

import { discoverFiles, groupFiles, readInvocation } from './owner-lint-plan.mjs';

const GRAPH_SKIP = 'No cached ProjectGraph is available. The rule will be skipped.';
const SCAN_TAIL = 4096;
const REPORT_LIMIT = 4 * 1024 * 1024;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const formatter = fileURLToPath(new URL('./owner-lint-reporter.mjs', import.meta.url));

function note(message) {
  process.stderr.write(`Frontend lint ${message}\n`);
}

function signalExit(signal) {
  note(`stopped by ${signal}`);
  return 128 + constants.signals[signal];
}

/** Forward with backpressure and retain only the bounded overlap needed by the Nx warning scan. */
function watchStream(stream, destination) {
  let tail = '';
  let skipped = false;
  stream.on('data', (chunk) => {
    // Proof: discarding the previous chunk admitted the split Nx graph-skip warning.
    const text = tail + chunk.toString();
    // Proof: matching colored bytes directly admitted a warning with ANSI inside its text.
    skipped ||= stripVTControlCharacters(text).includes(GRAPH_SKIP);
    tail = text.slice(-SCAN_TAIL);
  });
  stream.pipe(destination, { end: false });
  return () => skipped;
}

function readCoverage(report, planned, code) {
  // Proof: deleting O_NOFOLLOW admitted the tested substituted report symlink.
  const descriptor = openSync(report, files.O_RDONLY | files.O_NOFOLLOW | files.O_NONBLOCK);
  try {
    const attributes = fstatSync(descriptor);
    // Proof: removing the file size bound admitted the oversized otherwise valid report.
    if (
      !attributes.isFile() ||
      attributes.nlink !== 1 ||
      attributes.size === 0 ||
      attributes.size > REPORT_LIMIT
    ) {
      throw new Error('Invalid coverage report file');
    }
    const coverage = JSON.parse(readFileSync(descriptor, 'utf8'));
    // Proof: bypassing the array check failed the malformed-report diagnostic assertion.
    if (!Array.isArray(coverage?.files)) {
      throw new Error('Invalid coverage report shape');
    }

    const remaining = new Set(planned);
    let hasErrors = false;
    for (const entry of coverage.files) {
      // Proof: weakening path membership admitted duplicate and wrong-file reports in separate faults.
      if (!remaining.delete(entry?.filePath)) {
        throw new Error('Duplicate or unexpected coverage path: ' + entry?.filePath);
      }
      const counts = [entry.errorCount, entry.warningCount, entry.fatalErrorCount];
      // Proof: bypassing count validation admitted a negative count.
      if (
        !counts.every((count) => Number.isSafeInteger(count) && count >= 0) ||
        entry.fatalErrorCount > entry.errorCount
      ) {
        throw new Error('Invalid diagnostic counts for ' + entry.filePath);
      }
      hasErrors ||= entry.errorCount > 0;
    }
    // Proof: permitting leftover paths admitted a report that omitted the selected file.
    if (remaining.size > 0) {
      throw new Error('Missing coverage for ' + remaining.values().next().value);
    }
    // Proof: skipping this check admitted reported findings with child status zero.
    if ((code === 1) !== hasErrors) {
      throw new Error('Coverage diagnostics disagree with ESLint status ' + code);
    }
  } finally {
    closeSync(descriptor);
  }
}

async function lintOwner() {
  const root = process.cwd();
  const request = readInvocation(root, process.argv.slice(2));
  const requireOwner = createRequire(join(root, 'package.json'));
  const eslint = join(dirname(requireOwner.resolve('eslint/package.json')), 'bin/eslint.js');

  let cancelled;
  let active;
  let reports;
  const forwardSignal = (signal) => {
    cancelled ??= signal;
    // Proof: suppressing the forward and exiting before the child stop failed separate cancellation assertions.
    active?.kill(cancelled);
  };
  for (const signal of SIGNALS) process.on(signal, forwardSignal);

  function runChild(argv, group, report) {
    const child = spawn(process.execPath, [eslint, ...argv], {
      cwd: root,
      env: report ? { ...process.env, PUNI_FE_LINT_REPORT: report } : process.env,
      stdio: report ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    });
    active = child;
    note(`started ${group} (PID ${child.pid ?? 'unavailable'})`);
    const stdoutSkipped = child.stdout && watchStream(child.stdout, process.stdout);
    const stderrSkipped = child.stderr && watchStream(child.stderr, process.stderr);
    return new Promise((settle) => {
      let startError;
      child.once('error', (error) => {
        startError = error;
      });
      // Proof: settling on exit instead allowed dispatch before the original stdout pipe closed.
      child.once('close', (code, signal) => {
        active = undefined;
        note(
          `settled ${group} (PID ${child.pid ?? 'unavailable'}, ${signal ?? code ?? 'unknown'})`,
        );
        settle({ code, signal, startError, graphSkipped: stdoutSkipped?.() || stderrSkipped?.() });
      });
    });
  }

  function exitStatus({ code, signal, startError }) {
    // Proof: replacing the native signal class with status 2 failed the real child signal test.
    if (cancelled || signal) return signalExit(cancelled ?? signal);
    // Proof: ignoring the spawn error failed the actual absent-working-directory witness.
    if (startError) {
      note(`could not spawn ESLint: ${startError.message}`);
      return 2;
    }
    if (code === null) {
      note('worker closed without an exit status');
      return 2;
    }
    return code;
  }

  try {
    if (request.mode === 'whole-cli') {
      note(`mode whole-cli (${request.reason})`);
      return exitStatus(await runChild([...request.operands, ...request.forwarded], 'whole CLI'));
    }

    note('mode serial');
    const groups = groupFiles(root, await discoverFiles(root, request.operands));
    reports = mkdtempSync(join(tmpdir(), 'puni-fe-lint-'));
    let lintFailed = false;
    for (const [index, group] of groups.entries()) {
      // Proof: removing the pre-dispatch latch let a child start after cancellation during discovery.
      if (cancelled) return signalExit(cancelled);
      const report = join(reports, `${index}.json`);
      const outcome = await runChild(
        ['--format', formatter, '--', ...group.files],
        group.name,
        report,
      );
      const code = exitStatus(outcome);
      // Proof: demoting configuration status 2 to findings failed the lint-then-config witness.
      if (code !== 0 && code !== 1) return code;
      if (outcome.graphSkipped) {
        note(`${group.name}: Nx graph policy was skipped`);
        return 2;
      }
      try {
        // Proof: skipping report validation admitted missing reports after both clean and lint exits.
        readCoverage(report, group.files, code);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(group.name + ': invalid coverage report: ' + reason, { cause: error });
      }
      // Proof: removing failure aggregation admitted a real first child lint failure.
      lintFailed ||= code === 1;
    }
    return lintFailed ? 1 : 0;
  } finally {
    for (const signal of SIGNALS) process.off(signal, forwardSignal);
    if (reports) rmSync(reports, { recursive: true });
  }
}

try {
  process.exitCode = await lintOwner();
} catch (error) {
  note(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
