import { registeredTemplates, selectTemplate } from './registry';

const Usage =
  'usage: twilight-bureaucrat template <list|show <template-id>|verify <template-id> <committed|staged|working> <repository> <revision-or-base> <subject>>';

/** `template list` and `template show <id>`; slice 2 adds `verify`. */
export function writeTemplateCommand(argv: readonly string[]): void {
  const [, action, templateId] = argv;
  if (argv.length === 2 && action === 'list') {
    process.stdout.write(
      `${JSON.stringify({
        schemaVersion: 1,
        templates: registeredTemplates().map(({ id, version, subject, generates }) => ({
          id,
          version,
          subject,
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
  throw new Error(Usage);
}
