import { type } from 'arktype';

/**
 * The tailnet policy of `infra/access/policy.hujson` against the rows of design decision 12 of
 * openspec/changes/separate-node-roles: who may reach what over the private access network. The
 * file names tags and built-in groups only, because this repository is public.
 */

/**
 * What each source may reach, as `<destination>:<ports>` exactly as the file spells a grant's
 * `ip` entry. A tag absent here may reach nothing: every server tag, each cluster's Kubernetes
 * operator tag and its proxies' tags.
 */
export const accessRows: Readonly<Record<string, readonly string[]>> = {
  'autogroup:admin': [
    'tag:platform:tcp:6443',
    'tag:ci:tcp:6443',
    'tag:platform-proxy:tcp:443',
    'tag:ci-proxy:tcp:443',
    'tag:ci-api-proxy:tcp:443',
  ],
  'tag:ci-trigger': ['tag:ci-api-proxy:tcp:443'],
  'tag:operator-host': ['tag:ci-api-proxy:tcp:443'],
};

/** Every tag the policy declares; each has a row above or reaches nothing. */
const declaredTags = [
  'tag:platform',
  'tag:apps',
  'tag:observability',
  'tag:ci',
  'tag:operator-host',
  'tag:ci-trigger',
  'tag:platform-operator',
  'tag:ci-operator',
  'tag:platform-proxy',
  'tag:ci-proxy',
  'tag:ci-api-proxy',
];

/**
 * Parses HuJSON, the policy file's format: JSON with `//` and block comments and trailing
 * commas. Comments are blanked outside strings only; a malformed file throws.
 */
export function parseHujson(source: string): unknown {
  let plain = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = index;
      const match = end.exec(source);
      if (match === null) throw new Error('policy.hujson is not valid HuJSON: open string');
      plain += match[0];
      index += match[0].length;
    } else if (source.startsWith('//', index)) {
      const newline = source.indexOf('\n', index);
      index = newline < 0 ? source.length : newline;
    } else if (source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      if (close < 0) throw new Error('policy.hujson is not valid HuJSON: open comment');
      index = close + 2;
    } else {
      plain += char;
      index += 1;
    }
  }
  try {
    return JSON.parse(plain.replace(/,(\s*[}\]])/g, '$1')) as unknown;
  } catch (cause) {
    throw new Error('policy.hujson is not valid HuJSON', { cause });
  }
}

function isPrincipal(name: string): boolean {
  return /^(?:tag|autogroup):[a-z0-9-]+$/.test(name);
}

const GrantSchema = type({ src: 'string[]', dst: 'string[]', ip: 'string[]', '+': 'reject' });
/** The sections decision 12 uses, and nothing else: no Tailscale SSH, no ACLs, no auto-approvers. */
const PolicySchema = type({
  tagOwners: { '[string]': 'string[]' },
  grants: GrantSchema.array(),
  'groups?': { '[string]': 'string[]' },
  '+': 'reject',
});

/**
 * Problems with a parsed policy: a section or grant key the decision does not use (Tailscale SSH
 * among them), a principal that is not a tag or a built-in group, a tag outside the declared set,
 * and any source whose reach differs from its row of {@link accessRows}. Empty means it matches.
 */
export function judgeAccessPolicy(input: unknown): string[] {
  // Proof: dropping `'+': 'reject'` from GrantSchema made access-policy.test.ts `refuses
  // Tailscale SSH rules, other sections and unknown grant keys` fail (2026-11-22).
  const policy = PolicySchema(input);
  if (policy instanceof type.errors) return [`policy does not decode: ${policy.summary}`];
  const problems: string[] = [];
  // Proof: skipping this check for groups made access-policy.test.ts `refuses a policy that
  // names a person` resolve on its group case (2026-11-22).
  for (const [group, members] of Object.entries(policy.groups ?? {})) {
    for (const member of members) {
      if (!isPrincipal(member)) {
        problems.push(`${group} names ${member}, not a tag or a built-in group`);
      }
    }
  }
  const owners = policy.tagOwners;
  if (JSON.stringify(Object.keys(owners).sort()) !== JSON.stringify([...declaredTags].sort())) {
    problems.push(
      `tagOwners declares ${Object.keys(owners).join(', ')}, not ${declaredTags.join(', ')}`,
    );
  }
  for (const [tag, tagOwners] of Object.entries(owners)) {
    for (const owner of tagOwners) {
      if (!isPrincipal(owner)) {
        problems.push(`${tag} is owned by ${owner}, not a tag or a built-in group`);
      }
    }
  }

  const reach = new Map<string, Set<string>>();
  policy.grants.forEach(({ src, dst, ip }, position) => {
    for (const name of [...src, ...dst]) {
      if (!isPrincipal(name)) {
        problems.push(`grant ${String(position + 1)} names ${name}, not a tag or a built-in group`);
      }
    }
    for (const source of src) {
      const reached = reach.get(source) ?? new Set<string>();
      for (const destination of dst) {
        for (const ports of ip) reached.add(`${destination}:${ports}`);
      }
      reach.set(source, reached);
    }
  });
  // Every destination a source reaches is compared with its row, so a server tag, an operator
  // tag or a proxy tag reaching anything is refused, and so is a row widened by one port.
  // Proof: comparing tag names only (each source a declared tag or a built-in group) made
  // access-policy.test.ts `refuses a server tag that may reach another device`, the CI trigger,
  // the operator and the admin SSH cases resolve (2026-11-22).
  for (const [source, reached] of reach) {
    const allowed = accessRows[source] ?? [];
    for (const destination of reached) {
      if (!allowed.includes(destination)) {
        problems.push(
          `${source} may reach ${destination}; its row allows ${allowed.join(', ') || 'nothing'}`,
        );
      }
    }
  }
  for (const [source, allowed] of Object.entries(accessRows)) {
    for (const destination of allowed) {
      if (!(reach.get(source)?.has(destination) ?? false)) {
        problems.push(`${source} may not reach ${destination}, which its row grants`);
      }
    }
  }
  return problems;
}
