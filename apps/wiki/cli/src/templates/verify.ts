import { readCandidateBlob } from '../inventory/read-blob';
import {
  type CandidateRequest,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { registeredTemplates, selectTemplate } from './registry';
import {
  type ArtifactFile,
  declaredKinds,
  fileNameOf,
  importSpecifiers,
  taggedValues,
  type Template,
  type TemplateConstraint,
  type TemplateFinding,
  type TemplateRequirement,
  type TemplateVerification,
} from './template';

/** One file and the names beside it. Every file-scope constraint is judged against this. */
export interface FileScope {
  readonly scope: 'file';
  readonly file: ArtifactFile;
  /** The file names in the same directory, the file itself included. */
  readonly siblings: readonly string[];
}

function refuseScope(requirement: TemplateRequirement, scope: FileScope): never {
  throw new Error(
    `template requirement ${requirement.id} states a ${requirement.constraint.kind} constraint, which no ${scope.scope} artifact can satisfy`,
  );
}

function finding(requirement: TemplateRequirement, path: string, message: string): TemplateFinding {
  return { requirementId: requirement.id, path, message };
}

function oneKindFindings(
  requirement: TemplateRequirement,
  files: readonly ArtifactFile[],
): TemplateFinding[] {
  return (
    files
      // Proof: requiring more than two declared kinds made `reports a standalone file whose name
      // declares two kinds` lose its `resource.one-kind` finding. Observed 2026-09-20.
      .filter((file) => declaredKinds(file.path).length > 1)
      .map((file) =>
        finding(
          requirement,
          file.path,
          `file name declares ${declaredKinds(file.path).join(' and ')}`,
        ),
      )
  );
}

function fileFindings(
  requirement: TemplateRequirement,
  constraint: TemplateConstraint,
  scope: FileScope,
): TemplateFinding[] {
  const { file, siblings } = scope;
  switch (constraint.kind) {
    case 'name-suffix':
      // Proof: returning no finding here made `reports a file whose name lacks the kind suffix`
      // lose its `feature.suffix` finding. Observed 2026-09-20.
      return fileNameOf(file.path).endsWith(constraint.suffix)
        ? []
        : [finding(requirement, file.path, `file name does not end in ${constraint.suffix}`)];
    case 'one-kind-per-file':
      return oneKindFindings(requirement, [file]);
    case 'declares-one': {
      const stated = taggedValues(file.text, constraint.tag);
      // Proof: accepting fewer than 99 tags made `reports a service that states two declaration
      // tags` exit 0 instead of 1. Observed 2026-09-20.
      return stated.length === 1
        ? []
        : [
            finding(
              requirement,
              file.path,
              `file states ${String(stated.length)} @${constraint.tag} tags, expected exactly 1`,
            ),
          ];
    }
    case 'imports-no-kind': {
      const findings: TemplateFinding[] = [];
      for (const specifier of importSpecifiers(file.text, file.path)) {
        for (const forbidden of constraint.kinds) {
          // Proof: checking an empty kind list made `reports a side-effect import of a repository
          // and ignores comments and strings` exit 0 instead of 1. Observed 2026-09-20.
          if (declaredKinds(specifier).includes(forbidden)) {
            findings.push(
              finding(
                requirement,
                file.path,
                `the file imports ${specifier}, which declares the ${forbidden} kind`,
              ),
            );
          }
        }
      }
      return findings;
    }
    case 'sibling-test': {
      const name = fileNameOf(file.path);
      const testName = name.endsWith('.ts')
        ? `${name.slice(0, -'.ts'.length)}.test.ts`
        : `${name}.test.ts`;
      // Proof: returning no finding here made `reports a repository adapter with no sibling test`
      // exit 0 instead of 1. Observed 2026-09-20.
      return siblings.includes(testName)
        ? []
        : [finding(requirement, file.path, `no sibling ${testName} proves this file`)];
    }
    default:
      return refuseScope(requirement, scope);
  }
}

/** Every finding one template's requirements produce over one artifact. */
function requirementFindings(template: Template, scope: FileScope): TemplateFinding[] {
  // Proof: skipping the first requirement made `evaluates exactly the requirements the template
  // states` lose its sole `probe.tag` finding. Observed 2026-09-20.
  return template.requirements.flatMap((requirement) =>
    fileFindings(requirement, requirement.constraint, scope),
  );
}

function verification(
  template: Template,
  subject: string,
  findings: readonly TemplateFinding[],
): TemplateVerification {
  return {
    schemaVersion: 1,
    templateId: template.id,
    templateVersion: template.version,
    subject,
    conforms: findings.length === 0,
    findings,
    certifies: false,
  };
}

/**
 * Judges one artifact against one template, by evaluating exactly the requirements the template
 * states. Pure: every byte it reads is already in `files`.
 * @throws Error when the artifact does not match the template's subject kind, when a requirement
 * states a constraint the artifact's scope cannot satisfy, or when a file does not parse.
 */
export function verifyArtifact(
  template: Template,
  subject: string,
  files: readonly ArtifactFile[],
  siblingsOf: (path: string) => readonly string[],
): TemplateVerification {
  const file = files.find((candidate) => candidate.path === subject);
  if (file === undefined) {
    throw new Error(`template ${template.id} verifies one file; ${subject} is not one`);
  }
  return verification(
    template,
    subject,
    requirementFindings(template, { scope: 'file', file, siblings: siblingsOf(file.path) }),
  );
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
}

/**
 * The text of one selected file, refusing bytes this judge cannot read.
 *
 * Every selected TypeScript file is parsed here, whether or not a constraint reads its imports, so
 * a malformed support file, contract or test refuses the artifact instead of passing unexamined.
 * @throws Error naming the file when its bytes are not UTF-8 or its source does not parse.
 */
function decodeArtifact(repository: string, blob: string, path: string): string {
  if (!path.endsWith('.ts') && !path.endsWith('.md')) return '';
  const bytes = readCandidateBlob(repository, blob, path);
  let text: string;
  try {
    // Proof: decoding without `fatal` made `refuses a candidate file that is not UTF-8` receive
    // empty stderr instead of the encoding refusal. Observed 2026-09-20.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`candidate file ${path} is not UTF-8: ${detail}`, { cause });
  }
  if (path.endsWith('.ts')) importSpecifiers(text, path);
  return text;
}

export interface TemplateVerifyRequest {
  readonly templateId: string;
  readonly repository: string;
  readonly candidate: CandidateRequest;
  readonly subject: string;
}

/**
 * Reads one artifact out of a candidate revision and judges it against one template.
 * @throws Error when the subject is not candidate-relative, selects nothing, or is the wrong kind
 * of subject for the template. An unknown subject is never an empty artifact.
 */
export function verifyTemplateInCandidate(request: TemplateVerifyRequest): TemplateVerification {
  const template = selectTemplate(request.templateId);
  const root = resolveCandidateRoot(request.repository);
  const subject = request.subject.replace(/\/+$/, '');
  // Proof: deleting this guard made `refuses a subject that is not candidate-relative` report an
  // empty selection for `/etc/passwd` instead of the path refusal. Observed 2026-09-20.
  if (subject.length === 0 || subject.startsWith('/') || subject.split('/').includes('..')) {
    throw new Error(`subject must be a candidate-relative path: ${request.subject}`);
  }
  const snapshot = readCandidate(root, request.candidate);
  const selected =
    template.subject === 'directory'
      ? snapshot.entries.filter((entry) => entry.path.startsWith(`${subject}/`))
      : snapshot.entries.filter((entry) => entry.path === subject);
  if (selected.length === 0) {
    // Proof: returning a finding-free verification for an absent subject made `refuses a subject
    // that selects nothing` exit 0 instead of 1. Observed 2026-09-20.
    const mistaken = snapshot.entries.some((entry) =>
      template.subject === 'directory'
        ? entry.path === subject
        : entry.path.startsWith(`${subject}/`),
    );
    // Proof: forcing `mistaken` false made `refuses a file template pointed at a directory`
    // report an empty selection instead of the subject-kind refusal. Observed 2026-09-20.
    throw new Error(
      mistaken
        ? `template ${template.id} verifies one ${template.subject}; ${subject} is not one`
        : `subject selects no candidate file: ${subject}`,
    );
  }
  const prefix = template.subject === 'directory' ? `${subject}/` : '';
  const files: ArtifactFile[] = selected.map((entry) => ({
    path: entry.path,
    relativePath: entry.path.slice(prefix.length),
    text: decodeArtifact(root, entry.blob, entry.path),
  }));
  const siblingsOf = (path: string): string[] =>
    snapshot.entries
      .filter((entry) => directoryOf(entry.path) === directoryOf(path))
      .map((entry) => fileNameOf(entry.path));
  return verifyArtifact(template, subject, files, siblingsOf);
}

const Usage =
  'usage: twilight-bureaucrat template <list|show <template-id>|verify <template-id> <committed|staged|working> <repository> <revision-or-base> <subject>>';

function candidateRequest(kind: string, revision: string): CandidateRequest {
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    // Proof: treating an invalid kind as committed made `refuses an unknown candidate selection
    // kind` exit 0 instead of 1. Observed 2026-09-20.
    throw new Error(Usage);
  }
  return kind === 'committed' ? { kind, revision } : { kind, base: revision };
}

/** `template list`, `template show <id>`, `template verify <id> <kind> <repo> <rev> <subject>` */
export function writeTemplateCommand(argv: readonly string[]): void {
  const [, action, templateId, kind, repository, revision, subject] = argv;
  if (argv.length === 2 && action === 'list') {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        templates: registeredTemplates().map(({ id, version, subject: verifies, generates }) => ({
          id,
          version,
          subject: verifies,
          generates,
        })),
      })}\n`,
    );
    return;
  }
  if (argv.length === 3 && action === 'show') {
    process.stdout.write(`${JSON.stringify(selectTemplate(templateId))}\n`);
    return;
  }
  if (argv.length === 7 && action === 'verify') {
    const verified = verifyTemplateInCandidate({
      templateId,
      repository,
      candidate: candidateRequest(kind, revision),
      subject,
    });
    process.stdout.write(`${JSON.stringify(verified)}\n`);
    // Proof: deleting this assignment made `reports a file whose name lacks the kind suffix`
    // exit 0 instead of 1. Observed 2026-09-20.
    if (!verified.conforms) process.exitCode = 1;
    return;
  }
  // Proof: deleting this refusal made `refuses an unknown template action` exit 0 instead of 1.
  // Observed 2026-09-20.
  throw new Error(Usage);
}
