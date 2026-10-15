const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/navigation.js'), 'utf8');
  const { ROOT_SCREENS, navigationHistory, createExitConfirmation } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.deepEqual(navigationHistory(['groupHome'], 'groupWorkspace', 'reportList'), []);
  assert.deepEqual(navigationHistory([], 'reportList', 'download'), ['reportList']);
  assert.deepEqual(navigationHistory(['groupHome'], 'groupWorkspace', 'groupReports'), ['groupHome', 'groupWorkspace']);
  assert.deepEqual(navigationHistory(['groupHome'], 'groupWorkspace', 'groupReports', true), ['groupHome']);
  const exit = createExitConfirmation();
  assert.equal(exit.press(0), false);
  assert.equal(exit.press(1999), true);
  assert.equal(exit.press(2000), false);
  assert.equal(exit.press(4001), false, 'expired confirmation cannot close the app');
  exit.reset(); assert.equal(exit.press(4002), false);

  // Run the actual App navigation callbacks with native actions recorded.
  const app = fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8');
  const ast = ts.createSourceFile('App.js', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const callbacks = {};
  function walk(node) {
    if (ts.isVariableDeclaration(node) && ['go', 'goBack'].includes(node.name.getText(ast))) callbacks[node.name.getText(ast)] = node.initializer.getText(ast);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  const screenRef = { current: 'mapDirect' }, historyRef = { current: [] };
  const events = [], keyboardVisibleRef = { current: false }, exitConfirmation = { current: createExitConfirmation() };
  let panelOpen = false;
  const factory = new Function('navigateSafely', 'screenRef', 'historyRef', 'exitConfirmation', 'keyboardVisibleRef', 'consumeScreenBack', 'ROOT_SCREENS', 'navigationHistory', 'setGroupHomeTab', 'setMapInitialized', 'setScreen', 'Platform', 'BackHandler', 'ToastAndroid', 'Keyboard', `return { go: ${callbacks.go}, goBack: ${callbacks.goBack} };`);
  const { go, goBack } = factory(move => move(), screenRef, historyRef, exitConfirmation, keyboardVisibleRef, () => { if (!panelOpen) return false; panelOpen = false; events.push('close panel'); return true; }, ROOT_SCREENS, navigationHistory, tab => events.push(tab), () => {}, () => {}, { OS: 'android' }, { exitApp: () => events.push('exit') }, { SHORT: 0, show: () => events.push('prompt') }, { dismiss: () => events.push('keyboard') });
  go('reportList'); go('groupHome'); go('settings');
  assert.deepEqual(historyRef.current, [], 'bottom tabs must not become a back stack');
  goBack(); assert.equal(events.at(-1), 'prompt');
  go('reportList'); goBack(); assert.equal(events.at(-1), 'prompt', 'tab changes reset exit confirmation');
  go('download'); goBack(); assert.equal(screenRef.current, 'reportList');
  panelOpen = true; goBack(); assert.equal(events.at(-1), 'close panel');
  keyboardVisibleRef.current = true; goBack(); assert.equal(events.at(-1), 'keyboard');
  keyboardVisibleRef.current = false; goBack(); goBack(); assert.equal(events.at(-1), 'exit');
  go('dashboard'); assert.equal(screenRef.current, 'groupHome'); assert.ok(events.includes('dashboard'));
  console.log('Navigation checks passed: tab reset, nested back, panel/keyboard priority, double-back and legacy dashboard redirect');
})().catch(error => { console.error(error); process.exitCode = 1; });
