const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function callback(file, name) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let expression;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, walk);
  }
  walk(ast); assert.ok(expression); return expression;
}
(async () => {
  const group = { groupId: 1 }, user = { userId: 10 }, writes = {};
  const members = [{ userId: 10, name: 'me' }, { userId: 20, name: 'teammate' }];
  const values = { group, user, tab: 'transfer', assignments: [], requestsOnly: false, recipientId: 20,
    groupApi: async url => url.includes('/members?') ? members : url.includes('/locations/') ? [{ taskId: 5 }] : { ...group, members },
    transferHistoryPage: async () => { throw new Error('history server unavailable'); }, showAlert: () => {},
  };
  for (const name of ['setLoadingSettings','setDetail','setSharedTasks','setReportCount','setTransferRequests',
    'setHistoryHasMore','setHistoryError','setTasks','setMembers','setRequests','setPendingRequestTaskIds','setLoading']) {
    values[name] = value => { writes[name] = value; };
  }
  function load(file, name) { return new Function(...Object.keys(values), `return (${callback(file, name)});`)(...Object.values(values)); }
  await load(require.resolve('../screens/GroupWorkspaceScreen.js'), 'loadSettings')();
  assert.equal(writes.setDetail.members.length, 2, 'history failure must not discard successfully loaded teammates');
  assert.equal(writes.setSharedTasks[0].taskId, 5);
  assert.ok(writes.setHistoryError); assert.equal(writes.setLoadingSettings, false);
  await load(require.resolve('../screens/TransferScreen.js'), 'load')();
  assert.equal(writes.setMembers.length, 2, 'transfer picker must load teammates independently of history');
  assert.equal(writes.setTasks[0].taskId, 5); assert.equal(writes.setLoading, false);
  console.log('Transfer loading regression checks passed: unavailable history cannot hide teammates or visits');
})().catch(error => { console.error(error); process.exitCode = 1; });
