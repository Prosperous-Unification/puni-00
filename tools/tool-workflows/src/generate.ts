import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { format } from 'prettier';

/** Existing source forms differ in prompts/examples; preserve both, without copied templates. */
const workflows = [
  ['apply', 'apply-change', 'Apply', ['workflow', 'artifacts', 'experimental']],
  ['archive', 'archive-change', 'Archive', ['workflow', 'archive', 'experimental']],
  [
    'bulk-archive',
    'bulk-archive-change',
    'Bulk Archive',
    ['workflow', 'archive', 'experimental', 'bulk'],
  ],
  ['continue', 'continue-change', 'Continue', ['workflow', 'artifacts', 'experimental']],
  ['explore', 'explore', 'Explore', ['workflow', 'explore', 'experimental', 'thinking']],
  ['ff', 'ff-change', 'Fast Forward', ['workflow', 'artifacts', 'experimental']],
  ['new', 'new-change', 'New', ['workflow', 'artifacts', 'experimental']],
  ['onboard', 'onboard', 'Onboard', ['workflow', 'onboarding', 'tutorial', 'learning']],
  ['sync', 'sync-specs', 'Sync', ['workflow', 'specs', 'experimental']],
  ['verify', 'verify-change', 'Verify', ['workflow', 'verify', 'experimental']],
] as const;

/** Throws on unreadable/malformed source; command bodies cannot silently become empty. */
function readSource(root: string, pathname: string): { text: string; description: string } {
  // Proof: workflows.test.ts removes/chmods canonical sources; the actual CLI
  // exits 1 naming the path (ENOENT/EACCES), for both --check and --write.
  const text = readFileSync(join(root, pathname), 'utf8');
  const matched = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(text);
  // Proof: 'a damaged source wrapper cannot silently erase a command' supplies
  // a wrapper without frontmatter; the CLI exits 1 and names that source.
  if (!matched?.[1] || !matched[2]) throw new Error(`Malformed workflow source: ${pathname}`);
  const header: unknown = Bun.YAML.parse(matched[1]);
  // Proof: workflows.test.ts replaces description with missing-description;
  // the CLI exits 1 naming the source and leaves the probe variant unchanged.
  if (
    typeof header !== 'object' ||
    header === null ||
    !('description' in header) ||
    typeof header.description !== 'string'
  ) {
    throw new Error(`Missing workflow description: ${pathname}`);
  }
  return { text, description: header.description };
}

/** A single skill owns each shared policy block; other installed forms receive it here. */
function replacePolicy(
  text: string,
  policy: RegExp,
  replacement: string,
  pathname: string,
): string {
  // Proof: workflows.test.ts removes the bulk archive policy heading; the CLI
  // exits 1 naming that source and leaves the probe variant unchanged.
  if (!policy.test(text)) throw new Error(`Missing shared policy in ${pathname}`);
  return text.replace(policy, () => replacement);
}

function renderClaude(text: string): string {
  for (const [command, skill] of workflows)
    text = text.replaceAll(`/openspec-${skill}`, `/opsx:${command}`);
  return text.replaceAll('/openspec-propose', '/opsx:propose');
}

/** Read every source before writing; check reads all 40 actual installed paths without Nx caching.
 * Maintenance contract: docs/2026-09-06-openspec-upgrade.md.
 */
async function generateWorkflows(mode: string, root: string): Promise<void> {
  const sources = workflows.map(([command, skill, title, tags]) => {
    const skillPath = `.agents/skills/openspec-${skill}/SKILL.md`;
    const commandPath = `.agents/skills/source-command-opsx-${command}/SKILL.md`;
    return {
      command,
      title,
      tags,
      skillPath,
      commandPath,
      skill: readSource(root, skillPath),
      wrapper: readSource(root, commandPath),
    };
  });
  const supported = new Set(sources.flatMap((source) => [source.skillPath, source.commandPath]));
  // Proof: the unrecognized-source CLI test exited 0 without this inventory check
  // (expected 1); adding openspec-unrecognized is now refused before generation.
  for (const name of readdirSync(join(root, '.agents/skills'))) {
    const pathname = `.agents/skills/${name}/SKILL.md`;
    if (
      (name.startsWith('openspec-') || name.startsWith('source-command-opsx-')) &&
      !supported.has(pathname)
    ) {
      throw new Error(`Unsupported workflow source: ${pathname}`);
    }
  }
  const archivePattern = / {3}\*\*Load current archive inputs[\s\S]*?(?=\n\d+\. \*\*)/;
  const ffPattern = /4\. \*\*Create every artifact[\s\S]*?(?=5\. \*\*Show final status)/;
  function readPolicy(pathname: string, pattern: RegExp): string {
    const policy = pattern.exec(readSource(root, pathname).text)?.[0];
    // Proof: workflows.test.ts removes the canonical archive policy heading;
    // the CLI exits 1 naming that source before changing the probe variant.
    if (!policy) throw new Error(`Missing canonical policy in ${pathname}`);
    return policy;
  }
  const archivePolicy = readPolicy(
    '.agents/skills/openspec-archive-change/SKILL.md',
    archivePattern,
  );
  const ffPolicy = readPolicy('.agents/skills/openspec-ff-change/SKILL.md', ffPattern);
  const outputs = new Map<string, string>();
  for (const source of sources) {
    let skillText = source.skill.text;
    let wrapperText = source.wrapper.text;
    if (source.command === 'archive' || source.command === 'bulk-archive') {
      skillText = replacePolicy(skillText, archivePattern, archivePolicy, source.skillPath);
      wrapperText = replacePolicy(wrapperText, archivePattern, archivePolicy, source.commandPath);
    }
    if (source.command === 'ff')
      wrapperText = replacePolicy(wrapperText, ffPattern, ffPolicy, source.commandPath);
    const commandBody = wrapperText.split('## Command Template\n')[1];
    // Proof: workflows.test.ts replaces the command template marker; the CLI
    // exits 1 naming the wrapper and leaves the probe variant unchanged.
    if (!commandBody?.trim()) throw new Error(`Missing command template: ${source.commandPath}`);
    const commandHeader = `---\nname: ${JSON.stringify(`OPSX: ${source.title}`)}\ndescription: ${JSON.stringify(source.wrapper.description)}\nallowed-tools: Bash(openspec:*)\ncategory: Workflow\ntags: ${JSON.stringify(source.tags)}\n---\n`;
    outputs.set(source.skillPath, skillText);
    outputs.set(source.commandPath, wrapperText);
    outputs.set(source.skillPath.replace('.agents/', '.claude/'), renderClaude(skillText));
    outputs.set(`.claude/commands/opsx/${source.command}.md`, commandHeader + commandBody);
  }
  const rendered = await Promise.all(
    [...outputs].map(
      async ([pathname, text]) =>
        [
          pathname,
          await format(text, { parser: 'markdown', singleQuote: true, printWidth: 100 }),
        ] as const,
    ),
  );
  for (const [pathname, text] of rendered) {
    const absolute = join(root, pathname);
    if (mode === '--check') {
      // Proof: removing this comparison made the divergent-command CLI test fail:
      // expected exit 1, received 0. Deleted/chmod-000 variants produce ENOENT/EACCES.
      if (readFileSync(absolute, 'utf8') !== text)
        throw new Error(`Workflow drift: ${pathname}; run bunx nx run tool-workflows:generate`);
    } else {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, text);
    }
  }
  process.stdout.write(
    `${mode === '--check' ? 'Checked' : 'Generated'} ${String(outputs.size)} workflow variants\n`,
  );
}

const [mode, directory, ...extra] = process.argv.slice(2);
// Proof: 'unsupported CLI arguments fail without writing' passes --unknown;
// the actual CLI exits 1.
if ((mode !== '--check' && mode !== '--write') || extra.length > 0)
  throw new Error('Usage: generate.ts <--check|--write> [repository]');
await generateWorkflows(mode, resolve(directory ?? process.cwd()));
