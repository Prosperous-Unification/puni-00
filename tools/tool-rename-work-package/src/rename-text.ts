import { protectionOf } from './allow-list';
import { constantSpellingOf, type OldWord, RENAME_MAP, type Spellings } from './rename-map';

/** What a character is part of, as far as choosing a spelling needs to know. */
type Site = 'code' | 'inline' | 'string' | 'comment' | 'prose';

/** How a file is read: its comment syntax, quote characters and whether it is Markdown. */
interface Syntax {
  readonly markdown: boolean;
  readonly lineComment: string | undefined;
  readonly blockComment: boolean;
  readonly quotes: string;
  readonly templates: boolean;
  readonly jsx: boolean;
  readonly sql: boolean;
}

/** One string literal's content bounds, quotes excluded. */
interface StringSpan {
  readonly start: number;
  readonly end: number;
}

interface Lexed {
  readonly sites: Site[];
  /** Per character: the index into `spans` of the string it sits in, or -1. */
  readonly spanOf: Int32Array;
  readonly spans: StringSpan[];
}

const PLAIN: Syntax = {
  markdown: false,
  lineComment: undefined,
  blockComment: false,
  quotes: `'"`,
  templates: false,
  jsx: false,
  sql: false,
};

/**
 * The syntax a path is read with, by extension. Unknown extensions read as plain code with
 * `'` and `"` strings and no comments, which leaves every bare word an identifier.
 */
export function syntaxOf(path: string): Syntax {
  const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
  if (extension === 'md' || extension === 'mdx') return { ...PLAIN, markdown: true };
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'].includes(extension)) {
    return {
      ...PLAIN,
      lineComment: '//',
      blockComment: true,
      quotes: `'"`,
      templates: true,
      jsx: extension === 'tsx' || extension === 'jsx',
    };
  }
  if (extension === 'json' || extension === 'jsonc') {
    return { ...PLAIN, quotes: '"', lineComment: extension === 'jsonc' ? '//' : undefined };
  }
  if (['yml', 'yaml', 'sh', 'toml', 'py'].includes(extension))
    return { ...PLAIN, lineComment: '#' };
  if (extension === 'sql') return { ...PLAIN, lineComment: '--', blockComment: true, sql: true };
  return PLAIN;
}

/**
 * Marks every character of `text` with its {@link Site}. A heuristic lexer, not a parser:
 * regular-expression literals read as code, and an unterminated `'` or `"` string ends at its
 * line's end. Backtick spans inside comments and Markdown prose read as code, the way they
 * render. A Markdown HTML comment (the `module-index` envelope) reads as JSON.
 */
function lex(text: string, syntax: Syntax): Lexed {
  const sites = new Array<Site>(text.length);
  const spanOf = new Int32Array(text.length).fill(-1);
  const spans: StringSpan[] = [];
  if (syntax.markdown) {
    lexMarkdown(text, sites, spanOf, spans);
    return { sites, spanOf, spans };
  }
  lexCode(text, 0, text.length, syntax, sites, spanOf, spans);
  return { sites, spanOf, spans };
}

function lexMarkdown(text: string, sites: Site[], spanOf: Int32Array, spans: StringSpan[]): void {
  let fenced = false;
  let offset = 0;
  for (const line of text.split('\n')) {
    const end = offset + line.length;
    if (/^\s*(?:```|~~~)/.test(line)) {
      fenced = !fenced;
      sites.fill('code', offset, end + 1);
    } else if (fenced) {
      sites.fill('code', offset, end + 1);
    } else {
      let inline = false;
      let index = offset;
      while (index <= end) {
        if (text.startsWith('<!--', index)) {
          const close = text.indexOf('-->', index);
          const stop = close === -1 || close > end ? end : close + 3;
          lexCode(text, index, stop, { ...PLAIN, quotes: '"' }, sites, spanOf, spans);
          index = stop;
          continue;
        }
        if (text[index] === '`') inline = !inline;
        sites[index] = inline || text[index] === '`' ? 'inline' : 'prose';
        index += 1;
      }
    }
    offset = end + 1;
  }
}

function lexCode(
  text: string,
  from: number,
  to: number,
  syntax: Syntax,
  sites: Site[],
  spanOf: Int32Array,
  spans: StringSpan[],
): void {
  // Template-expression depths: a `}` at depth 0 of the innermost one resumes its template.
  const templateDepths: number[] = [];
  let index = from;
  const markString = (start: number, quote: string, template: boolean): number => {
    const span = spans.length;
    spans.push({ start: start + 1, end: start + 1 });
    sites[start] = 'string';
    let cursor = start + 1;
    while (cursor < to) {
      const char = text[cursor];
      if (char === '\\') {
        sites[cursor] = 'string';
        sites[cursor + 1] = 'string';
        spanOf[cursor] = span;
        spanOf[cursor + 1] = span;
        cursor += 2;
        continue;
      }
      if (char === quote || (!template && char === '\n')) break;
      if (template && char === '$' && text[cursor + 1] === '{') {
        spans[span] = { start: start + 1, end: cursor };
        templateDepths.push(0);
        sites[cursor] = 'code';
        sites[cursor + 1] = 'code';
        return cursor + 2;
      }
      sites[cursor] = 'string';
      spanOf[cursor] = span;
      cursor += 1;
    }
    spans[span] = { start: start + 1, end: cursor };
    if (cursor < to) sites[cursor] = 'string';
    return cursor + 1;
  };
  while (index < to) {
    const char = text[index] ?? '';
    if (syntax.lineComment !== undefined && text.startsWith(syntax.lineComment, index)) {
      const newline = text.indexOf('\n', index);
      const stop = newline === -1 || newline > to ? to : newline;
      markComment(text, index, stop, sites);
      index = stop;
      continue;
    }
    if (syntax.blockComment && text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const stop = close === -1 || close > to ? to : close + 2;
      markComment(text, index, stop, sites);
      index = stop;
      continue;
    }
    const depth = templateDepths.at(-1);
    if (depth !== undefined && char === '}') {
      if (depth === 0) {
        templateDepths.pop();
        index = markString(index, '`', true);
        continue;
      }
      templateDepths[templateDepths.length - 1] = depth - 1;
    } else if (depth !== undefined && char === '{') {
      templateDepths[templateDepths.length - 1] = depth + 1;
    }
    if (syntax.quotes.includes(char) && char !== '') {
      index = markString(index, char, false);
      continue;
    }
    if (syntax.templates && char === '`') {
      index = markString(index, '`', true);
      continue;
    }
    sites[index] = 'code';
    index += 1;
  }
}

function markComment(text: string, from: number, to: number, sites: Site[]): void {
  let inline = false;
  for (let index = from; index < to; index += 1) {
    if (text[index] === '`') inline = !inline;
    sites[index] = inline || text[index] === '`' ? 'inline' : 'comment';
  }
}

const OLD_WORD =
  /(?<![A-Za-z0-9])projects?(?![a-z])|(?<![A-Z])Projects?(?![a-z])|(?<![A-Za-z0-9])PROJECTS?(?![A-Za-z0-9])/g;
const SQL_WORDS =
  /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FROM|JOIN|WHERE|INTO|TABLE|INDEX|TRIGGER)\b/;
const IDENTIFIER_HINT =
  /(?:@param(?:\s+\{[^}]*\})?|@property|@returns?|\{@link(?:code|plain)?)\s+$/;
const FILE_EXTENSION =
  /^\.(?:ts|tsx|js|jsx|mjs|json|md|sql|sh|ya?ml|db|test|spec|routes|resource|controller|feature|module)\b/;
const JSX_TEXT = /[A-Za-z0-9 ,.!?'’:;()–—-]/;

function spellingsOf(word: string): Spellings {
  const old: OldWord = word.toLowerCase().endsWith('s') ? 'projects' : 'project';
  const spellings = RENAME_MAP.get(old);
  if (spellings === undefined) throw new Error(`rename map has no family for ${old}`);
  return spellings;
}

function capitalized(prose: string): string {
  return `${prose.charAt(0).toUpperCase()}${prose.slice(1)}`;
}

/** The character at `index`, or `undefined` outside `text`: plain indexing types it `string`. */
function charAt(text: string, index: number): string | undefined {
  return index >= 0 && index < text.length ? text.charAt(index) : undefined;
}

const isAlphanumeric = (char: string | undefined): boolean =>
  char !== undefined && /[A-Za-z0-9]/.test(char);

/** True when the standalone word at `[start, end)` sits in JSX text between `>` and `<`/`{`. */
function isJsxText(text: string, start: number, end: number): boolean {
  let left = start - 1;
  while (left >= 0 && JSX_TEXT.test(text[left] ?? '')) left -= 1;
  if (text[left] !== '>' || text[left - 1] === '=') return false;
  let right = end;
  while (right < text.length && JSX_TEXT.test(text[right] ?? '')) right += 1;
  return text[right] === '<' || text[right] === '{';
}

/**
 * The replacement for one old word at `[start, end)`. The rules, first match wins: an
 * upper-case word is the constant spelling (left alone beside `-`, where it is a scenario id);
 * beside `_` it is SQL; followed by an upper-case letter, digit or `$` it is an identifier
 * (`projectId`) or, capitalized after a lower-case letter, a type (`CanonicalProject`). A
 * standalone word reads by site: beside `/`, `-` or before `.ext` in prose and strings it is a
 * path; in prose, comments and JSX text it is prose; a whole string is SQL (`'project'`) unless
 * an object key follows; `'project:` opens the realtime prefix; SQL text keeps SQL; other code
 * is an identifier or type.
 */
function replacementAt(
  text: string,
  start: number,
  end: number,
  lexed: Lexed,
  syntax: Syntax,
): string {
  const word = text.slice(start, end);
  const spellings = spellingsOf(word);
  const kind = /^[A-Z]{2}/.test(word) ? 'upper' : /^[A-Z]/.test(word) ? 'capital' : 'lower';
  const before = charAt(text, start - 1);
  const after = charAt(text, end);
  if (kind === 'upper') {
    return before === '-' || after === '-' ? word : constantSpellingOf(spellings);
  }
  const named = kind === 'lower' ? spellings.identifier : spellings.type;
  const path = kind === 'lower' ? spellings.path : spellings.type;
  if (before === '_' || after === '_') return kind === 'lower' ? spellings.sql : spellings.type;
  if (after !== undefined && /[A-Z0-9$]/.test(after)) return named;
  if (kind === 'capital' && /[a-z0-9]/.test(before ?? '')) return named;
  if (before === '$') return named;
  const site = lexed.sites[start] ?? 'code';
  const adjoinsPath =
    before === '/' ||
    after === '/' ||
    (before === '-' && isAlphanumeric(charAt(text, start - 2))) ||
    (after === '-' && isAlphanumeric(charAt(text, end + 1)));
  const precedesExtension = FILE_EXTENSION.test(text.slice(end, end + 12));
  const prose = kind === 'lower' ? spellings.prose : capitalized(spellings.prose);
  if (site === 'comment' || site === 'prose') {
    if (IDENTIFIER_HINT.test(text.slice(Math.max(0, start - 40), start))) return named;
    if (adjoinsPath || precedesExtension) return path;
    return prose;
  }
  if (site === 'string') {
    const spanIndex = lexed.spanOf[start] ?? -1;
    const span = spanIndex === -1 ? undefined : lexed.spans.at(spanIndex);
    if (span === undefined) throw new Error(`string site at ${String(start)} has no span`);
    const content = text.slice(span.start, span.end);
    if (kind === 'lower' && after === ':' && start === span.start) return spellings.path;
    if (adjoinsPath || precedesExtension) return path;
    if (syntax.sql || SQL_WORDS.test(content)) return kind === 'lower' ? spellings.sql : named;
    if (start === span.start && end === span.end) {
      if (kind === 'capital') return prose;
      const isKey =
        text[end + 1] === ':' && !/\bcase\s+.$/.test(text.slice(Math.max(0, start - 12), start));
      return isKey ? spellings.identifier : spellings.sql;
    }
    if (/\s/.test(content)) return prose;
    return named;
  }
  if (syntax.jsx && site === 'code' && isJsxText(text, start, end)) return prose;
  if (adjoinsPath || (site === 'inline' && precedesExtension)) return path;
  if (syntax.sql) return kind === 'lower' ? spellings.sql : named;
  return named;
}

/**
 * `text` with every old word respelled (design E11), lines a {@link protectionOf} pattern
 * matches left byte-identical. Idempotent: no target spelling contains an old word, so a second
 * pass finds nothing to replace.
 */
export function renameText(text: string, path: string): string {
  const syntax = syntaxOf(path);
  const lexed = lex(text, syntax);
  const pieces: string[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length;
    if (protectionOf(line) !== undefined) {
      pieces.push(line);
    } else {
      let cursor = offset;
      let rewritten = '';
      for (const match of line.matchAll(OLD_WORD)) {
        const start = offset + match.index;
        const end = start + match[0].length;
        rewritten += text.slice(cursor, start) + replacementAt(text, start, end, lexed, syntax);
        cursor = end;
      }
      pieces.push(rewritten + text.slice(cursor, lineEnd));
    }
    offset = lineEnd + 1;
  }
  return pieces.join('\n');
}

/**
 * `path` with every old word in its segments respelled: a standalone or kebab word takes the
 * path spelling (`project-stream.ts` to `work-package-stream.ts`), a camel or snake one its
 * identifier, type or SQL spelling.
 */
export function renamePath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      segment.replace(OLD_WORD, (word: string, index: number) => {
        const spellings = spellingsOf(word);
        const before = charAt(segment, index - 1);
        const after = charAt(segment, index + word.length);
        if (/^[A-Z]{2}/.test(word)) return constantSpellingOf(spellings);
        if (/^[A-Z]/.test(word)) return spellings.type;
        if (before === '_' || after === '_') return spellings.sql;
        if (after !== undefined && /[A-Z0-9$]/.test(after)) return spellings.identifier;
        return spellings.path;
      }),
    )
    .join('/');
}
