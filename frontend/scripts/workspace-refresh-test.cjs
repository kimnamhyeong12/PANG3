const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('../node_modules/@babel/parser');
const source = fs.readFileSync(require.resolve('../App.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
const callbacks = new Map(); let polling;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.init?.callee?.name === 'useCallback') callbacks.set(node.id.name, node.init.arguments[0]);
  if (node.type === 'CallExpression' && node.callee?.name === 'useEffect' && source.slice(node.start, node.end).includes('const timer = pollSharedWorkspace')) polling = node.arguments[0];
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
}
walk(ast.program);
function compile(node, env) { return new Function(...Object.keys(env), `return (${source.slice(node.start, node.end)});`)(...Object.values(env)); }
async function refresh(personal, fail = false) {
  let requests = 0, mine = 0, teamRows;
  const env = { activeGroup: { groupId: 7, personal }, user: { userId: 1 }, console: { log() {} },
    groupApi: async () => { requests++; if (fail) throw Error('offline'); return [{ taskId: 12, latitude: 35, longitude: 129 }]; },
    setGroupAssignments() {}, teamLoadIdRef: { current: 0 }, workspaceCacheKey: () => 'workspace',
    teamSaveQueueRef: { current: Promise.resolve() }, AsyncStorage: { getItem: async () => null, setItem: async () => {} },
    teamLoadedKeyRef: { current: null }, teamSessionRef: { current: { locations: [] } }, numberVisits: rows => rows,
    wasRouteSessionEnded: () => false, restoreRouteSession: () => null, calendarDayKey: '2026-10-30',
    setTeamLocations: rows => { teamRows = rows; }, setTeamRouteSegments() {}, setTeamRoadPath() {},
    setTeamCurrentSegmentIndex() {}, setTeamOptimized() {}, setTeamIsGuiding() {}, setTeamTotalDuration() {}, setTeamRouteResumeToken() {},
    loadWorkspaceLocations: async () => { mine++; }, isPersonalGroup: group => group.personal };
  env.refreshGroupAssignments = compile(callbacks.get('refreshGroupAssignments'), env);
  env.loadTeamLocations = compile(callbacks.get('loadTeamLocations'), env);
  await compile(callbacks.get('refreshCurrentWorkspace'), env)();
  assert.equal(requests, 1, 'one shared endpoint request per workspace refresh, including failure');
  assert.equal(mine, 1);
  if (!personal && !fail) assert.equal(teamRows[0].id, 12, 'shared results still populate normalized team markers');
  if (personal) assert.equal(teamRows, undefined, 'personal refresh does not query a team map');
}
function liveNotifications() {
 assert.equal(polling,undefined,'visit polling effect is removed for personal and team workspaces');
 assert.ok(source.includes("liveSync.subscribe(event =>"));
 assert.ok(source.includes("['tasks', 'groups', 'resync']"));
 assert.ok(source.includes('liveSync.pause()')&&source.includes('liveSync.resume()'));
}
(async () => { await refresh(false); await refresh(true); await refresh(false, true); liveNotifications();
  console.log('Workspace refresh checks passed: shared request reused, failed request not duplicated, change notifications and reconnect reconciliation replace periodic polling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
