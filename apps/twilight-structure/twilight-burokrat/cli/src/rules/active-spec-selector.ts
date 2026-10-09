import type { Heading, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

import { hashBytes } from '../evidence/content-manifest';
import { extractScenarioHeadingsFromSyntax } from './scenario-headings';

export interface SpecInput {
  readonly path: string;
  readonly capability: string;
  readonly markdown: string;
  readonly digest: string;
  readonly kind: 'main' | 'change';
}

interface Requirement {
  readonly capability: string;
  readonly title: string;
  readonly source: string;
  readonly digest: string;
  readonly scenarios: readonly { title: string; id?: string }[];
}

interface Operation {
  readonly kind: 'ADDED' | 'MODIFIED' | 'REMOVED';
  readonly requirement: Requirement;
}

export interface ActiveSpecSelection {
  readonly inputs: readonly { path: string; digest: string }[];
  readonly effective: readonly {
    capability: string;
    title: string;
    source: string;
    digest: string;
    scenarios: readonly { title: string; id?: string }[];
    aliases: readonly string[];
  }[];
  readonly operations: readonly {
    kind: 'ADDED' | 'MODIFIED' | 'REMOVED';
    capability: string;
    title: string;
    source: string;
    digest: string;
  }[];
  readonly removals: readonly { capability: string; title: string; ids: readonly string[] }[];
}

const Identified = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] (.+)$/;

function headingTitle(markdown: string, heading: Heading): string {
  const start = heading.position?.start.offset;
  const end = heading.position?.end.offset;
  if (start === undefined || end === undefined)
    throw new Error('active specification heading has no source offsets');
  const raw = markdown.slice(start, end);
  const match = /^\s*#{1,3}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(raw);
  if (match === null) throw new Error('active specification heading has malformed source');
  return match[1];
}

function parseRequirements(spec: SpecInput): {
  requirements: readonly Requirement[];
  operations: readonly Operation[];
} {
  const syntax: Root = fromMarkdown(spec.markdown);
  // Proof: excluding depth-one headings made the production orphan-after-Notes negative
  // attribute its scenario to the preceding requirement, reaching allocator provenance.
  const sections = syntax.children.filter(
    (node): node is Heading => node.type === 'heading' && node.depth <= 3,
  );
  const requirements: Requirement[] = [];
  const operations: Operation[] = [];
  let parsedScenarioCount = 0;
  let operation: Operation['kind'] | undefined;
  let inCanonicalRequirements = false;
  for (const [position, heading] of sections.entries()) {
    const label = headingTitle(spec.markdown, heading);
    if (heading.depth === 1) {
      // Proof: removing operation reset accepted the production overlay-after-depth-one case;
      // removing canonical reset accepted the canonical-after-depth-one case.
      operation = undefined;
      inCanonicalRequirements = false;
      continue;
    }
    if (heading.depth === 2) {
      if (spec.kind === 'change') {
        const match = /^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/.exec(label);
        if (match !== null) {
          // Proof: the production RENAMED overlay negative reached a successful verdict with
          // this refusal disabled because the selector silently treated it as no operation.
          if (match[1] === 'RENAMED')
            throw new Error(`unsupported overlay operation: ${spec.path}`);
          operation = match[1] as Operation['kind'];
        } else if (label.endsWith('Requirements')) {
          // Proof: disabling this branch made the production REPLACED section negative
          // fail at the later missing-operation diagnostic instead of this boundary.
          throw new Error(`unsupported overlay operation: ${spec.path}: ${label}`);
        } else {
          operation = undefined;
        }
      } else {
        inCanonicalRequirements = label === 'Requirements';
      }
      continue;
    }
    if (!label.startsWith('Requirement: ')) continue;
    // Proof: before this guard, the production Notes negative accepted a canonical requirement.
    if (spec.kind === 'main' && !inCanonicalRequirements)
      throw new Error(`canonical requirement outside Requirements: ${spec.path}`);
    // Proof: disabling this guard made the production missing-operation negative fail at
    // the later empty-spec diagnostic instead of rejecting its requirement here.
    if (spec.kind === 'change' && operation === undefined)
      throw new Error(`overlay requirement has no operation: ${spec.path}`);
    const title = label.slice('Requirement: '.length);
    const start = heading.position?.start.offset;
    const next = sections.slice(position + 1).find((section) => section.depth <= 3);
    const end = next?.position?.start.offset ?? spec.markdown.length;
    if (start === undefined)
      throw new Error('active specification requirement has no source offsets');
    const fragment = spec.markdown.slice(start, end);
    const fragmentSyntax = fromMarkdown(fragment);
    const scenarios = extractScenarioHeadingsFromSyntax(fragment, fragmentSyntax).map(
      ({ title: raw }) => {
        const identified = Identified.exec(raw);
        return identified === null ? { title: raw } : { id: identified[1], title: identified[2] };
      },
    );
    parsedScenarioCount += scenarios.length;
    // Proof: disabling this guard made the production scenario-free ADDED negative pass.
    if (scenarios.length === 0 && operation !== 'REMOVED')
      throw new Error(`active requirement has no scenarios: ${spec.path}: ${title}`);
    const requirement = {
      capability: spec.capability,
      title,
      source: spec.path,
      digest: hashBytes(Buffer.from(fragment)),
      scenarios,
    };
    if (spec.kind === 'main') requirements.push(requirement);
    else if (operation !== undefined) operations.push({ kind: operation, requirement });
  }
  // Proof: disabling this comparison made the production orphan-heading negative accept an
  // identified heading after a non-requirement section, silently losing its obligation.
  if (extractScenarioHeadingsFromSyntax(spec.markdown, syntax).length !== parsedScenarioCount)
    throw new Error(`scenario heading outside a requirement: ${spec.path}`);
  // Proof: disabling this guard made the production empty change-spec negative pass.
  if (requirements.length + operations.length === 0)
    throw new Error(`active specification has no requirements: ${spec.path}`);
  return { requirements, operations };
}

function keyOf(requirement: Pick<Requirement, 'capability' | 'title'>): string {
  return `${requirement.capability}\u0000${requirement.title}`;
}

function scenarioKey(scenario: { title: string; id?: string }): string {
  return scenario.id === undefined ? `title:${scenario.title}` : `id:${scenario.id}`;
}

/** Selects one effective requirement lineage from immutable active OpenSpec blobs. */
export function selectActiveSpecifications(inputs: readonly SpecInput[]): ActiveSpecSelection {
  // Proof: disabling this guard made the production empty-inventory negative lose the
  // named refusal and fail later at missing active allocation.
  if (inputs.length === 0) throw new Error('active canonical specification inventory is absent');
  const canonical = new Map<string, Requirement & { aliases: string[] }>();
  const mainKeys: string[] = [];
  const operations: Operation[] = [];
  for (const spec of inputs) {
    const parsed = parseRequirements(spec);
    for (const requirement of parsed.requirements) {
      const key = keyOf(requirement);
      const existing = canonical.get(key);
      // Proof: disabling this guard made the production duplicate-requirement negative pass.
      if (existing !== undefined)
        throw new Error(
          `duplicate canonical requirement: ${requirement.capability}: ${requirement.title}`,
        );
      canonical.set(key, { ...requirement, aliases: [] });
      mainKeys.push(key);
    }
    operations.push(...parsed.operations);
  }
  const seenOperations = new Set<string>();
  const removals: { capability: string; title: string; ids: string[] }[] = [];
  for (const { kind, requirement } of operations) {
    const key = keyOf(requirement);
    // Proof: removing this refusal made the two-change production negative select one
    // modification by path order and unexpectedly accept competing operations.
    if (seenOperations.has(key))
      throw new Error(
        `competing overlay operation: ${requirement.capability}: ${requirement.title}`,
      );
    seenOperations.add(key);
    const predecessor = canonical.get(key);
    if (kind === 'ADDED') {
      if (predecessor !== undefined) {
        // An already synced identical requirement is one lineage, but a divergent ADDED
        // operation cannot replace main without an explicit MODIFIED operation.
        // Proof: disabling this guard made the divergent synced-copy production negative pass.
        if (predecessor.digest !== requirement.digest) {
          throw new Error(
            `conflicting active specification requirement: ${requirement.capability}: ${requirement.title}`,
          );
        }
        predecessor.aliases.push(requirement.source);
      } else {
        canonical.set(key, { ...requirement, aliases: [] });
      }
      continue;
    }
    // Proof: removing this guard made the production missing-predecessor negative fail with a
    // TypeError while reading predecessor.scenarios instead of the modeled refusal.
    if (predecessor === undefined)
      throw new Error(
        `overlay requirement has no predecessor: ${requirement.capability}: ${requirement.title}`,
      );
    if (kind === 'REMOVED') {
      removals.push({
        capability: requirement.capability,
        title: requirement.title,
        ids: predecessor.scenarios.flatMap((scenario) =>
          scenario.id === undefined ? [] : [scenario.id],
        ),
      });
      canonical.delete(key);
      continue;
    }
    const revised = new Set(requirement.scenarios.map(scenarioKey));
    // Proof: removing this retained-scenario guard made the production MODIFIED negative
    // accept a replacement that silently dropped a canonical scenario.
    if (predecessor.scenarios.some((scenario) => !revised.has(scenarioKey(scenario))))
      throw new Error(
        `MODIFIED requirement drops canonical scenario: ${requirement.capability}: ${requirement.title}`,
      );
    canonical.set(key, { ...requirement, aliases: [...predecessor.aliases, predecessor.source] });
  }
  const inputIdentity = inputs
    .map(({ path, digest }) => ({ path, digest }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const addedKeys = [...canonical.keys()].filter((key) => !mainKeys.includes(key)).sort();
  const effective = [...mainKeys, ...addedKeys]
    .flatMap((key) => {
      const requirement = canonical.get(key);
      return requirement === undefined ? [] : [requirement];
    })
    .map(({ aliases, ...requirement }) => ({ ...requirement, aliases: [...aliases].sort() }));
  const applied = operations
    .map(({ kind, requirement }) => ({
      kind,
      capability: requirement.capability,
      title: requirement.title,
      source: requirement.source,
      digest: requirement.digest,
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.title.localeCompare(right.title),
    );
  return { inputs: inputIdentity, effective, operations: applied, removals };
}
