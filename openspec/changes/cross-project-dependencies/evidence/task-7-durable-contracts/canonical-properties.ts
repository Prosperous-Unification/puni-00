import ts from 'typescript';
const text = await Bun.file('libs/wbs/domain/domain/src/canonical-connected-stage-input.ts').text();
const source = ts.createSourceFile('canonical.ts', text, ts.ScriptTarget.Latest, true);
const properties: { name: string; text: string }[] = [];
function members(node: ts.Node) {
  if (ts.isPropertyAssignment(node))
    properties.push({ name: node.name.getText(source), text: node.getText(source) });
  ts.forEachChild(node, members);
}
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'canonical') {
    if (node.initializer === undefined) throw new Error('canonical initializer missing');
    members(node.initializer);
  } else ts.forEachChild(node, visit);
}
visit(source);
process.stdout.write(JSON.stringify(properties));
