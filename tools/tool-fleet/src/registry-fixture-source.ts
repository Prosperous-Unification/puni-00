/** Quote one JS/Python string literal; escape every closing-tag/Unicode-separator character after JSON quoting handles controls, quotes and backslashes. */
export function quoteFixtureString(text: string): string {
  // Proof: removing global escaping leaves repeated raw closing-tag/separator characters; registry-fixture-source.test.ts fails its emitted-literal contract.
  return JSON.stringify(text).replace(
    /[<>\u2028\u2029]/g,
    (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/** Encode JSON as a quoted string for JSON.parse/json.loads, preserving own keys rather than inserting object literals. Unsupported JSON values throw. */
export function quoteFixtureJson(value: unknown): string {
  return quoteFixtureString(JSON.stringify(value));
}

/** Standalone copied Python fixture: all runtime values are decoded JSON data, and its pinned source needs no sidecar or inherited environment. */
export function renderDockerFixture(imageId: string, observed: unknown, archive: string): string {
  return `#!/usr/bin/python3
import sys,json,shutil
if sys.argv[1:3]==['image','inspect'] and sys.argv[-1]==json.loads(${quoteFixtureJson(imageId)}): print(json.dumps(json.loads(${quoteFixtureJson(observed)})))
elif sys.argv[1:4]==['image','save','--output'] and sys.argv[-1]==json.loads(${quoteFixtureJson(imageId)}): shutil.copyfile(json.loads(${quoteFixtureJson(archive)}),sys.argv[4])
else: sys.exit(23)
`;
}
