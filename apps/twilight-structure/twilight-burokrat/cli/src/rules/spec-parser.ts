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

export interface Requirement {
  readonly capability: string;
  readonly title: string;
  readonly source: string;
  readonly digest: string;
  readonly scenarios: readonly { title: string; id?: string }[];
}

export interface Operation {
  readonly kind: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED';
  readonly requirement: Requirement;
  readonly from?: string;
  readonly fragmentDigest: string;
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

/** Parses active requirement fragments without accepting or resolving requirement lineage. */
export function parseRequirements(spec: SpecInput): {
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
          // The exact operation regex limits capture 1 to the Operation kind union.
          operation = match[1] as Operation['kind'];
          if (operation === 'RENAMED') {
            const start = heading.position?.end.offset;
            const next = sections.slice(position + 1).find((section) => section.depth <= 2);
            if (start === undefined) throw new Error('rename section has no source offsets');
            // Proof: disabling this heading guard made the production heading-in-pair
            // negative reach a generic pair-shape refusal instead of identifying its cause.
            if (
              sections
                .slice(position + 1)
                .some(
                  (section) =>
                    section.depth === 3 &&
                    section.position?.start.offset !== undefined &&
                    section.position.start.offset <
                      (next?.position?.start.offset ?? spec.markdown.length),
                )
            ) {
              throw new Error(`requirement heading inside rename pair: ${spec.path}`);
            }
            const section = spec.markdown.slice(
              start,
              next?.position?.start.offset ?? spec.markdown.length,
            );
            let offset = 0;
            const lines = section
              .split(/(?<=\n)/)
              .map((raw) => {
                const line = { text: raw.trim(), start: offset, end: offset + raw.length };
                offset += raw.length;
                return line;
              })
              .filter((line) => line.text.length > 0);
            // Proof: disabling this empty-section guard made a RENAMED section beside a
            // valid ADDED operation pass without a FROM/TO pair.
            if (lines.length === 0)
              throw new Error(`malformed requirement rename pair: ${spec.path}`);
            for (let index = 0; index < lines.length; index += 2) {
              const from = /^- FROM: `### Requirement: (.+)`$/.exec(lines[index].text);
              const destinationLine = lines.at(index + 1);
              const to =
                destinationLine === undefined
                  ? null
                  : /^- TO: `### Requirement: (.+)`$/.exec(destinationLine.text);
              // Proof: deleting this pair guard made the reversed-endpoint and odd
              // missing-TO production negatives fail with null-access errors instead
              // of the modeled refusal.
              if (from === null || to === null || destinationLine === undefined)
                throw new Error(`malformed requirement rename pair: ${spec.path}`);
              // Proof: disabling exact nonblank titles made the whitespace-only TO
              // production CLI negative exit 0 with an invented blank destination.
              if (
                from[1].trim().length === 0 ||
                to[1].trim().length === 0 ||
                from[1].trim() !== from[1] ||
                to[1].trim() !== to[1]
              ) {
                throw new Error(`malformed requirement rename pair: ${spec.path}`);
              }
              operations.push({
                kind: 'RENAMED',
                from: from[1],
                // Proof: hashing semantic endpoints failed TEST-AXES-055's raw CRLF/indentation digest.
                fragmentDigest: hashBytes(section.slice(lines[index].start, destinationLine.end)),
                requirement: {
                  capability: spec.capability,
                  title: to[1],
                  source: spec.path,
                  digest: hashBytes(Buffer.from(`${from[1]}\u0000${to[1]}`)),
                  scenarios: [],
                },
              });
            }
          }
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
    else if (operation !== undefined)
      operations.push({ kind: operation, requirement, fragmentDigest: requirement.digest });
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
