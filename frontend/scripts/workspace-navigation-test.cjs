const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
const ast = ts.createSourceFile('App.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let callback;
function walk(node) {
  if (ts.isJsxAttribute(node) && node.name.text === 'onOpenGroup') callback = node.initializer.expression.getText(ast);
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(callback);
(async () => {
  const selected = [], pages = [];
  const personal = { groupId: 2, personal: true }, shared = { groupId: 1, personal: false };
  const handler = active => new Function('activeGroup', 'rememberAvailableGroup', 'selectActiveGroup', 'setPersonalWorkspaceTab', 'setGroupWorkspaceTab', 'go', 'isPersonalGroup', `return (${callback});`)(active, () => {}, async group => selected.push(group.groupId), () => {}, () => {}, page => pages.push(page), group => group.personal);
  await handler(shared)(personal);
  assert.deepEqual(selected, [2]); assert.deepEqual(pages, [], 'first click switches workspace only');
  await handler(personal)(personal);
  assert.deepEqual(pages, ['workStatus'], 'second click opens the selected personal workspace');
  await handler(personal)(shared);
  assert.deepEqual(selected, [2, 1]); assert.deepEqual(pages, ['workStatus']);
  await handler(shared)(shared);
  assert.deepEqual(pages, ['workStatus', 'groupWorkspace']);
  console.log('Workspace navigation checks passed: switch first, enter on second click');
})().catch(error => { console.error(error); process.exitCode = 1; });
