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
function poll(shared) {
  let tick, resume, loads = 0, intervals = 0;
  const screenRef = { current: 'main' }, AppState = { currentState: 'active', addEventListener: (_, fn) => { resume = fn; return { remove() {} }; } };
  const env = { user: { userId: 1 }, pollSharedWorkspace: shared, AppState, screenRef,
    exitConfirmation: { current: { reset() {} } }, getLocalDateKey: () => '2026-10-30', setCalendarDayKey() {},
    loadWorkspaceLocations: () => loads++, setInterval: fn => { intervals++; tick = fn; return 1; }, clearInterval() {} };
  const cleanup = compile(polling, env)();
  assert.equal(intervals, shared ? 1 : 0, 'personal workspaces have no periodic server reads');
  screenRef.current = 'settings'; tick?.(); resume('active'); assert.equal(loads, 0, 'settings and inquiries do not refresh hidden map data');
  screenRef.current = 'mapDirect'; tick?.(); assert.equal(loads, shared ? 1 : 0);
  AppState.currentState = 'background'; tick?.(); assert.equal(loads, shared ? 1 : 0, 'no background polling');
  cleanup();
}
(async () => { await refresh(false); await refresh(true); await refresh(false, true); poll(false); poll(true);
  console.log('Workspace refresh checks passed: shared request reused, failed request not duplicated, personal/hidden/background polling suppressed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
