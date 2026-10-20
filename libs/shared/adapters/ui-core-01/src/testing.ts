/**
 * Readers for the stylesheets a kit and core ship, for tests that pin what a
 * file says rather than what a browser computed. Pure string functions, so a
 * browser lib may carry them; the test does the file reading.
 */

/** The stylesheet with every block comment removed. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * The custom-property declarations under every block that opens with exactly
 * `selector` (`:root`, `.dark`, `@theme inline`), merged in source order so a
 * later block wins the way the cascade would. A declaration that is not a
 * custom property is skipped; nested blocks are not read.
 *
 * @throws When no block opens with `selector`, because a test asserting on an
 * empty map would pass against a file that lost the block.
 */
export function readCustomProperties(css: string, selector: string): ReadonlyMap<string, string> {
  const source = stripCssComments(css);
  const properties = new Map<string, string>();
  let found = false;
  const opener = new RegExp(`(^|[\\s}])${escapeRegExp(selector)}\\s*\\{`, 'g');
  for (let match = opener.exec(source); match !== null; match = opener.exec(source)) {
    found = true;
    const start = match.index + match[0].length;
    const end = source.indexOf('}', start);
    if (end === -1) throw new Error(`block ${selector} is never closed`);
    for (const declaration of source.slice(start, end).split(';')) {
      const colon = declaration.indexOf(':');
      if (colon === -1) continue;
      const name = declaration.slice(0, colon).trim();
      if (!name.startsWith('--')) continue;
      properties.set(name, declaration.slice(colon + 1).trim());
    }
    opener.lastIndex = end;
  }
  if (!found) throw new Error(`no block opens with ${selector}`);
  return properties;
}

/**
 * The custom properties the vocabulary's `@theme inline` block references
 * through `var()`, deduplicated in first-seen order: the names a kit's theme
 * must assign in every palette.
 */
export function vocabularyTokens(vocabularyCss: string): readonly string[] {
  const names: string[] = [];
  for (const value of readCustomProperties(vocabularyCss, '@theme inline').values()) {
    for (const [, name] of value.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
