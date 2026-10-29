const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../components/KakaoMapWebView.js'), 'utf8');
// Drawing a selected district must not cause a second, late camera fit.
const boundaryFinish = source.slice(source.indexOf('  function finishBoundaryData('), source.indexOf('  function setBoundaryData('));
let boundaryFits = 0, boundaryMessages = 0;
const finish = new Function('map', 'post', `var boundaryHasCoordinates = true, boundaryAllBounds = {}, renderedBoundaryCount = 1; ${boundaryFinish}; return finishBoundaryData;`)(
  { setBounds() { boundaryFits++; } }, () => boundaryMessages++);
finish(false);
assert.equal(boundaryFits, 0, 'selected-district outline preserves the padded camera fit');
assert.equal(boundaryMessages, 1, 'outline completion is still acknowledged');
finish();
assert.equal(boundaryFits, 1, 'other boundary screens retain their existing automatic fit');
const start = source.indexOf('    if (commandData.type === "SELECTION_SESSION")');
const end = source.indexOf('    if (commandData.type === "SELECTION_MODE")', start);
const handle = new Function('state', 'map', 'post', 'ensureSelectionOverlay', `with (state) { ${source.slice(start, end)} }`);
const point = (lat, lng) => ({ getLat: () => lat, getLng: () => lng });
const visibleCenter = point(35.2, 129.2), old = point(35.1, 129.1);
const state = { commandData: { type: 'SELECTION_SESSION', enabled: true }, selectionSessionActive: false, selectedCenter: old, selectionMode: false, selectionDragStarted: false, selectionOverlay: null };
const messages = []; let shown = 0;
handle(state, { getCenter: () => visibleCenter }, data => messages.push(data), () => shown++);
assert.equal(state.selectedCenter, visibleCenter, 'new direct selection uses the visible viewport rather than an old selection');
assert.equal(shown, 1); assert.equal(messages[0].latitude, 35.2);
state.selectedCenter = old;
handle(state, { getCenter: () => visibleCenter }, () => {}, () => {});
assert.equal(state.selectedCenter, old, 'repeated commands preserve a selection already in progress');
console.log('Map direct-selection checks passed: visible center on entry and stable active selection');
