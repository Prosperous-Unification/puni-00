import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import {
  assertWorkspacePath,
  type BrowserCase,
  decodeBrowserJson,
  digestEvidenceBytes,
  reconcileBrowserJunit,
  reconcileBrowserRuns,
} from '@shared/test-evidence';
import { SaxesParser } from 'saxes';

import { readCandidateBlob } from '../inventory/read-blob';
import {
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { loadRulePolicyWithIdentity } from '../rules/rule-policy';
import { hashCanonical } from './content-manifest';

type Mode = 'ordinary' | 'packaged' | 'portable';
const digestPattern = /^[0-9a-f]{64}$/;
const invocationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function record(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`Browser ${label} is malformed`);
  return input as Record<string, unknown>; // External JSON boundary checked above.
}

function string(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length === 0)
    throw new Error(`Browser ${label} is malformed`);
  return input;
}

function digest(input: unknown, label: string): string {
  const value = string(input, label);
  if (!digestPattern.test(value)) throw new Error(`Browser ${label} digest is malformed`);
  return value;
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error(`Browser ${label} is not UTF-8`, { cause });
  }
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
  const source = decodeText(bytes, label);
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new Error(`Browser ${label} JSON is malformed`, { cause });
  }
}

/** Read a required regular file exactly once, refusing links and special files at every bundle boundary. */
function readRegular(root: string, path: string): Uint8Array {
  assertWorkspacePath(path);
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${resolve(root)}${sep}`))
    throw new Error(`Browser path escapes root: ${path}`);
  let cursor = root;
  for (const segment of path.split('/')) {
    cursor = join(cursor, segment);
    const metadata = lstatSync(cursor);
    // Proof: symlinked bundle and file negatives lose their named refusal when this check is disabled.
    if (metadata.isSymbolicLink()) throw new Error(`Browser evidence contains a symlink: ${path}`);
  }
  // Proof: the directory-as-manifest negative loses its regular-file refusal without this guard.
  if (!lstatSync(absolute).isFile())
    throw new Error(`Browser evidence is not a regular file: ${path}`);
  return readFileSync(absolute);
}

function boundBlob(repository: string, candidate: CandidateSnapshot, path: string): Uint8Array {
  const entry = candidate.entries.find((record) => record.path === path);
  // Proof: removing the regular-blob check let a missing candidate config match a manifest digest.
  if (entry === undefined || (entry.mode !== '100644' && entry.mode !== '100755'))
    throw new Error(`Browser candidate config is not a regular blob: ${path}`);
  return readCandidateBlob(repository, entry.blob, path);
}

function caseIdentity(browserCase: BrowserCase): string {
  return JSON.stringify([
    browserCase.config,
    browserCase.project,
    browserCase.file,
    browserCase.titlePath,
    browserCase.status,
  ]);
}

function exactCases(input: unknown, expected: readonly BrowserCase[]): void {
  if (!Array.isArray(input)) throw new Error('Browser manifest cases are malformed');
  const cases = input.map((entry) => {
    const fields = record(entry, 'case');
    if (
      typeof fields['config'] !== 'string' ||
      typeof fields['project'] !== 'string' ||
      typeof fields['file'] !== 'string' ||
      !Array.isArray(fields['titlePath']) ||
      !fields['titlePath'].every(
        (title: unknown) => typeof title === 'string' && title.length > 0,
      ) ||
      !['passed', 'failed', 'skipped'].includes(String(fields['status'])) ||
      Object.keys(fields).sort().join(',') !== 'config,file,project,status,titlePath'
    )
      throw new Error('Browser manifest case is malformed');
    return fields as unknown as BrowserCase; // Exact runtime shape checked above.
  });
  // Proof: changing manifest status alone loses its mismatch refusal without this equality.
  if (
    JSON.stringify(cases.map(caseIdentity).sort()) !==
    JSON.stringify(expected.map(caseIdentity).sort())
  )
    throw new Error('Browser manifest cases differ from raw execution');
}

/** Strict normalized JUnit tree and exact case/outcome/count parity. */
function reconcileNormalizedJunit(xml: string, mode: Mode, cases: readonly BrowserCase[]): void {
  const parser = new SaxesParser({ xmlns: false });
  const stack: string[] = [];
  const observed: BrowserCase[] = [];
  let counts: Record<string, number> | undefined;
  let current: BrowserCase | undefined;
  let roots = 0;
  parser.on('doctype', () => {
    throw new Error('Browser normalized JUnit doctype is forbidden');
  });
  parser.on('text', (body) => {
    if (body.trim() !== '' && !['failure', 'skipped'].includes(stack.at(-1) ?? ''))
      throw new Error('Browser normalized JUnit text is outside an outcome');
  });
  parser.on('opentag', (tag) => {
    const parent = stack.at(-1);
    if (tag.name === 'testsuite' && parent === undefined) {
      roots += 1;
      if (tag.attributes['name'] !== `browser.${mode}`)
        throw new Error('Browser normalized JUnit mode differs');
      counts = {};
      for (const key of ['tests', 'failures', 'errors', 'skipped']) {
        const raw = tag.attributes[key];
        if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw))
          throw new Error('Browser normalized JUnit count is malformed');
        counts[key] = Number(raw);
      }
    } else if (tag.name === 'testcase' && parent === 'testsuite') {
      const project = tag.attributes['classname'];
      const file = tag.attributes['file'];
      const name = tag.attributes['name'];
      if (
        typeof project !== 'string' ||
        typeof file !== 'string' ||
        typeof name !== 'string' ||
        Object.keys(tag.attributes).sort().join(',') !== 'classname,file,name'
      )
        throw new Error('Browser normalized JUnit testcase is malformed');
      assertWorkspacePath(file);
      current = { config: '', project, file, titlePath: [name], status: 'passed' };
      observed.push(current);
    } else if (
      (tag.name === 'failure' || tag.name === 'skipped') &&
      parent === 'testcase' &&
      current !== undefined
    ) {
      if (current.status !== 'passed')
        throw new Error('Browser normalized JUnit duplicate outcome');
      current.status = tag.name === 'failure' ? 'failed' : 'skipped';
    } else {
      // Proof: removing structural rejection let an extra sibling testcase root pass count parity.
      throw new Error('Browser normalized JUnit structure is malformed');
    }
    stack.push(tag.name);
  });
  parser.on('closetag', (tag) => {
    if (stack.pop() !== tag.name) throw new Error('Browser normalized JUnit nesting is malformed');
    if (tag.name === 'testcase') current = undefined;
  });
  parser.write(xml).close();
  if (roots !== 1 || counts === undefined || stack.length !== 0)
    throw new Error('Browser normalized JUnit root is malformed');
  const expected = cases.map((entry) => ({
    project: entry.project,
    file: entry.file,
    name: entry.titlePath.join(' › '),
    status: entry.status,
  }));
  const observedTuples = observed.map((entry) => ({
    project: entry.project,
    file: entry.file,
    name: entry.titlePath[0],
    status: entry.status,
  }));
  // Proof: removing the case comparison let the missing normalized testcase negative pass.
  if (
    JSON.stringify(
      observedTuples.sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
    ) !==
    JSON.stringify(
      expected.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    )
  )
    throw new Error('Browser normalized JUnit cases differ from execution');
  // Proof: removing count parity let a forged passing summary survive the raw case comparison.
  if (
    counts['tests'] !== observed.length ||
    counts['failures'] !== observed.filter((entry) => entry.status === 'failed').length ||
    counts['skipped'] !== observed.filter((entry) => entry.status === 'skipped').length ||
    counts['errors'] !== 0
  )
    throw new Error('Browser normalized JUnit counts differ');
}

/** Validate the declared build artifact inventory; bytes remain unauthenticated claims. */
export function checkArtifactInventory(manifest: Record<string, unknown>, mode: Mode): void {
  const artifact = manifest['artifact'];
  const served = manifest['served'];
  if (mode === 'ordinary') {
    if (artifact !== undefined || served !== undefined)
      throw new Error('Browser ordinary mode has build artifacts');
    return;
  }
  const expectedRoot =
    mode === 'packaged' ? 'dist/apps/wbs/fe-01' : 'dist/libs/wbs/application/core';
  const expectedArtifact =
    mode === 'packaged' ? `${expectedRoot}/index.html` : `${expectedRoot}/portable-composition.js`;
  const built = record(artifact, 'artifact');
  const inventory = record(served, 'served inventory');
  if (built['path'] !== expectedArtifact)
    throw new Error('Browser artifact path differs from mode');
  digest(built['digest'], 'artifact');
  if (
    inventory['root'] !== expectedRoot ||
    !Array.isArray(inventory['files']) ||
    inventory['files'].length === 0
  )
    throw new Error('Browser served inventory is malformed');
  const paths = new Set<string>();
  let foundArtifact = false;
  for (const input of inventory['files']) {
    const file = record(input, 'served file');
    const path = string(file['path'], 'served path');
    assertWorkspacePath(path);
    if (!path.startsWith(`${expectedRoot}/`) || paths.has(path))
      throw new Error('Browser served path is foreign or duplicated');
    paths.add(path);
    const fileDigest = digest(file['digest'], 'served file');
    if (path === expectedArtifact) {
      foundArtifact = true;
      if (fileDigest !== built['digest'])
        throw new Error('Browser artifact and served digest differ');
    }
  }
  if (!foundArtifact) throw new Error('Browser served inventory lacks built artifact');
}

function checkEnvironment(
  manifest: Record<string, unknown>,
  mode: Mode,
  projects: readonly string[],
): void {
  const environment = record(manifest['environment'], 'selection environment');
  const keys = Object.keys(environment).sort();
  if (environment['CI'] !== '1') throw new Error('Browser CI selection environment differs');
  if (mode === 'ordinary') {
    const shift = environment['E2E_PORT_SHIFT'];
    if (
      typeof shift !== 'string' ||
      !/^(0|[1-9][0-9]{0,3})$/.test(shift) ||
      ['100', '1000', '1100'].includes(shift)
    )
      throw new Error('Browser ordinary port shift differs');
    const regular = environment['PLAYWRIGHT_CHROMIUM_REGULAR'];
    if (regular !== undefined && regular !== '1')
      throw new Error('Browser Chromium selection differs');
    if (
      keys.join(',') !==
      (regular === '1' ? 'CI,E2E_PORT_SHIFT,PLAYWRIGHT_CHROMIUM_REGULAR' : 'CI,E2E_PORT_SHIFT')
    )
      throw new Error('Browser selection environment has unknown keys');
    if (
      JSON.stringify(projects) !==
      JSON.stringify(regular === '1' ? ['chromium', 'chromium-regular'] : ['chromium'])
    )
      throw new Error('Browser project selection differs from environment');
  } else if (keys.join(',') !== 'CI' || JSON.stringify(projects) !== JSON.stringify(['chromium'])) {
    throw new Error('Browser selection environment differs from mode');
  }
}

/** Diagnostic Browser observation; no receipt exists, so none of its cases is verified coverage. */
export function inspectBrowserBundle(
  repository: string,
  revision: string,
  policyPath: string,
  mode: Mode,
  hooks?: { afterBundleRead?: () => void },
): {
  schemaVersion: 1;
  candidate: string;
  policyDigest: string;
  mode: Mode;
  invocationId: string;
  observedCases: BrowserCase[];
  authentication: { kind: 'absent' };
  certifies: false;
} {
  const root = resolveCandidateRoot(repository);
  const selected = readCandidate(root, { kind: 'committed', revision });
  if (selected.selection.kind !== 'committed')
    throw new Error('Browser requires committed selection');
  const candidate = hashCanonical({
    selection: selected.selection,
    entries: selected.entries,
    untracked: selected.untracked,
  });
  const authority = loadRulePolicyWithIdentity(root, policyPath);
  const pins = authority.policy.browser?.modes.filter((entry) => entry.mode === mode);
  // Proof: removing policy authority refusal let an unreviewed Browser mode reach bundle parsing.
  if (pins?.length !== 1) throw new Error(`Browser ${mode} needs one external policy pin`);
  const pin = pins[0];
  const configDigest = digestEvidenceBytes(boundBlob(root, selected, pin.config));
  // Proof: changing the candidate config bytes loses its policy mismatch without this check.
  if (configDigest !== pin.configDigest)
    throw new Error('Browser candidate config differs from policy');
  const prefix = 'tmp/junit/browser';
  const pointerPath = `${prefix}/${mode}.current.json`;
  const pointerBytes = readRegular(root, pointerPath);
  const pointer = record(decodeJson(pointerBytes, 'pointer'), 'pointer');
  const invocationId = string(pointer['invocationId'], 'invocation ID');
  if (
    !invocationPattern.test(invocationId) ||
    pointer['schemaVersion'] !== 2 ||
    pointer['mode'] !== mode ||
    pointer['bundle'] !== `${prefix}/${invocationId}`
  )
    throw new Error('Browser pointer identity differs');
  const owner = string(pointer['owner'], 'owner');
  const tokenPaths = [`${prefix}/${mode}.owner`, `${prefix}/${mode}.latest-request`];
  const beforeTokens = tokenPaths.map((path) => readRegular(root, path));
  // Proof: a stale owner/latest token loses its refusal without this comparison.
  if (beforeTokens.some((bytes) => decodeText(bytes, 'token') !== owner))
    throw new Error('Browser publication token differs');
  const bundlePath = `${prefix}/${invocationId}`;
  const files = [
    'manifest.json',
    'discovery.json',
    'execution.json',
    'playwright.xml',
    'report.xml',
  ] as const;
  const bytes = new Map(files.map((file) => [file, readRegular(root, `${bundlePath}/${file}`)]));
  const bundleBytes = (name: (typeof files)[number]): Uint8Array => {
    const contents = bytes.get(name);
    if (contents === undefined) throw new Error(`Browser bundle lacks ${name}`);
    return contents;
  };
  const manifest = record(decodeJson(bundleBytes('manifest.json'), 'manifest'), 'manifest');
  const identity = record(manifest['candidate'], 'candidate identity');
  if (
    identity['schemaVersion'] !== 1 ||
    identity['tool'] !== 'twilight-burokrat' ||
    identity['toolVersion'] !== '0.1.0' ||
    identity['certifies'] !== false ||
    identity['candidate'] !== candidate ||
    JSON.stringify(identity['selection']) !== JSON.stringify(selected.selection)
  )
    throw new Error('Browser candidate identity differs from committed selection');
  if (
    manifest['schemaVersion'] !== 1 ||
    manifest['certifies'] !== false ||
    manifest['mode'] !== mode ||
    manifest['invocationId'] !== invocationId ||
    manifest['revision'] !== selected.selection.revision ||
    manifest['config'] !== pin.config ||
    manifest['configDigest'] !== configDigest
  )
    throw new Error('Browser manifest identity differs from selection and policy');
  const raw = record(manifest['raw'], 'raw bindings');
  for (const [name, field] of [
    ['discovery.json', 'discovery'],
    ['execution.json', 'execution'],
    ['playwright.xml', 'junit'],
  ] as const) {
    const binding = record(raw[field], `${field} binding`);
    if (
      binding['path'] !== `${bundlePath}/${name}` ||
      binding['digest'] !== digestEvidenceBytes(bundleBytes(name))
    )
      throw new Error(`Browser raw ${field} digest or path differs`);
  }
  if (
    manifest['report'] !== `${bundlePath}/report.xml` ||
    manifest['reportDigest'] !== digestEvidenceBytes(bundleBytes('report.xml'))
  )
    throw new Error('Browser normalized report digest or path differs');
  const discovery = record(decodeJson(bundleBytes('discovery.json'), 'discovery'), 'discovery');
  const config = record(discovery['config'], 'discovery config');
  const configFile = string(config['configFile'], 'config file');
  if (!configFile.endsWith(`/${pin.config}`))
    throw new Error('Browser raw config differs from policy');
  const checkout = configFile.slice(0, -pin.config.length - 1);
  if (!checkout.startsWith('/')) throw new Error('Browser raw checkout is malformed');
  const listed = decodeBrowserJson(discovery, checkout, pin.config, pin.projects, 'list', 0);
  const execution = decodeJson(bundleBytes('execution.json'), 'execution');
  const executionRecord = record(execution, 'execution');
  const executionCases = record(executionRecord['config'], 'execution config');
  if (executionCases['configFile'] !== configFile) throw new Error('Browser raw config changed');
  // The current collector bundle omits process exit status; the diagnostic cannot attest it.
  const run = decodeBrowserJson(execution, checkout, pin.config, pin.projects, 'run', undefined);
  // Proof: disabling this refusal made the all-skipped production diagnostic negative fail.
  if (run.cases.every((browserCase) => browserCase.status === 'skipped'))
    throw new Error('Browser execution contains only skipped cases');
  reconcileBrowserRuns(listed, run);
  reconcileBrowserJunit(decodeText(bundleBytes('playwright.xml'), 'raw JUnit'), run);
  exactCases(manifest['cases'], run.cases);
  if (manifest['runnerVersion'] !== listed.version)
    throw new Error('Browser runner version differs');
  checkEnvironment(manifest, mode, pin.projects);
  const coverage = record(manifest['coverage'], 'collector counts');
  if (
    coverage['passingCases'] !== run.cases.filter((entry) => entry.status === 'passed').length ||
    coverage['skippedDebt'] !== run.cases.filter((entry) => entry.status === 'skipped').length
  )
    throw new Error('Browser collector counts differ');
  reconcileNormalizedJunit(
    decodeText(bundleBytes('report.xml'), 'normalized JUnit'),
    mode,
    run.cases,
  );
  checkArtifactInventory(manifest, mode);
  hooks?.afterBundleRead?.();
  // Proof: the pointer-change race negative loses its final refusal without this reread.
  if (!Buffer.from(readRegular(root, pointerPath)).equals(Buffer.from(pointerBytes)))
    throw new Error('Browser current pointer changed during inspection');
  // Proof: a revoked generation after bundle read loses refusal without this reread.
  if (
    tokenPaths.some(
      (path, index) =>
        !Buffer.from(readRegular(root, path)).equals(Buffer.from(beforeTokens[index])),
    )
  )
    throw new Error('Browser publication token changed during inspection');
  return {
    schemaVersion: 1,
    candidate,
    policyDigest: authority.digest,
    mode,
    invocationId,
    observedCases: run.cases,
    authentication: { kind: 'absent' },
    certifies: false,
  };
}
