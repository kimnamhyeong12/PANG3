const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('../node_modules/@babel/core');

// Exercise the real editor's hooks and events. Native image operations are mocked;
// assertions cover crop coordinates, displayed sources, ink and async transitions.
function editor() {
  const slots = [], effects = [], responders = [], calls = [], alerts = [], saved = [];
  const images = new Map([['original', { width: 1200, height: 900, marks: 0 }],
    ['next-photo', { width: 800, height: 1200, marks: 0 }]]);
  let cursor = 0, dirty = true, tree, loadedUri, sequence = 0, failNext = false, pending;
  const props = { visible: true, uri: 'original', onComplete: uri => saved.push(uri) };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const label = node => typeof node === 'string' ? node : Array.isArray(node)
    ? node.map(label).join('') : node?.props ? label(node.props.children) : '';
  const native = { Dimensions: { get: () => ({ width: 400, height: 800 }) }, PixelRatio: { get: () => 2 },
    StyleSheet: { create: value => value, absoluteFill: {} },
    PanResponder: { create: handlers => { responders.push(handlers); return { panHandlers: handlers }; } },
    Image: 'Image', Modal: 'Modal', View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity' };
  // Image is a function so it can expose the native static method used by the editor.
  function NativeImage() {}
  NativeImage.getSize = (uri, success) => success(images.get(uri).width, images.get(uri).height);
  native.Image = NativeImage;
  const manipulateAsync = async (uri, actions) => {
    calls.push({ uri, actions });
    if (failNext) { failNext = false; throw Error('Native crop failed'); }
    if (pending) { const wait = pending; pending = null; await wait; }
    let result = { ...images.get(uri) };
    for (const action of actions) {
      if (action.crop) result = { ...result, width: action.crop.width, height: action.crop.height };
      if (action.rotate) result = { ...result, width: result.height, height: result.width };
    }
    const next = `edited-${++sequence}`;
    images.set(next, result);
    return { uri: next, width: result.width, height: result.height };
  };
  const dependencies = {
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 48, left: 0, right: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    './ui': { ScreenHeader: 'ScreenHeader' },
    '../constants/design': { colors: { primary: 'blue', text: 'black', textSoft: 'grey', textFaint: 'grey' } },
    '../utils/auth': { localImageForEditing: async uri => uri },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'react-native-svg': { __esModule: true, default: 'Svg', Polyline: 'Polyline' },
    './CustomAlert': { showAlert: (...args) => alerts.push(args) },
    'expo-image-manipulator': { manipulateAsync, SaveFormat: { JPEG: 'jpeg' } },
    'react-native-view-shot': { captureRef: async (ref, options) => {
      const nodes = all(ref.current), source = nodes.find(n => n.type === NativeImage).props.source.uri;
      const uri = `capture-${++sequence}`;
      images.set(uri, { width: options.width, height: options.height,
        marks: images.get(source).marks + nodes.filter(n => n.type === 'Polyline').length });
      calls.push({ capture: uri, source });
      return uri;
    } },
  };
  const code = babel.transformSync(fs.readFileSync(path.join(__dirname, '../components/PhotoMarkupEditor.js'), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[require('../node_modules/@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
      require('../node_modules/@babel/plugin-transform-modules-commonjs')],
  }).code;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, exports);
  function flush(load = true) {
    let rounds = 0;
    while (dirty || effects.length) {
      assert.ok(rounds++ < 50, 'hooks must settle');
      dirty = false; cursor = 0; tree = exports.default(props);
      for (const n of all(tree)) if (n.props?.ref) n.props.ref.current = n;
      effects.splice(0).forEach(fn => fn());
    }
    const image = all(tree).find(n => n.type === NativeImage);
    if (load && image && image.props.source.uri !== loadedUri) {
      loadedUri = image.props.source.uri; image.props.onLoad(); flush(false);
    }
    return tree;
  }
  function button(text) {
    flush(); const n = all(tree).find(n => n.type === 'TouchableOpacity' && (n.props.accessibilityLabel || label(n)) === text);
    assert.ok(n, `Missing button ${text}`); return n;
  }
  async function press(text) { const n = button(text); assert.ok(!n.props.disabled, text); await n.props.onPress(); flush(); }
  const photo = () => { flush(); return all(tree).find(n => n.type === NativeImage).props.source.uri; };
  function selectCrop(corner = "topLeft", release = true) {
    const size = all(flush()).find(n => n.type === NativeImage).props.style;
    responders[0].onPanResponderGrant({ nativeEvent: { locationX: corner === 'bottomRight' ? size.width : 0, locationY: corner === 'bottomRight' ? size.height : 0 } });
    const direction = corner === 'bottomRight' ? -1 : 1;
    responders[0].onPanResponderMove(null, { dx: direction * size.width / 4, dy: direction * size.height / 4 }); flush();
    if (release) return Promise.resolve(responders[0].onPanResponderRelease()).then(() => flush());
  }
  function draw() {
    responders[1].onPanResponderGrant({ nativeEvent: { locationX: 10, locationY: 10 } }); flush();
    responders[1].onPanResponderMove({ nativeEvent: { locationX: 60, locationY: 60 } }); flush();
    responders[1].onPanResponderRelease(); flush();
  }
  flush();
  return { press, button, photo, selectCrop, draw, calls, images, saved, alerts, flush,
    fail: () => { failNext = true; }, defer: wait => { pending = wait; },
    change: next => { Object.assign(props, next); dirty = true; flush(); } };
}

(async () => {
  // Saving/restoring an unchanged server photo must keep its server path;
  // otherwise the report manifest would send a keep action with a null path.
  const ts = require('../node_modules/typescript');
  const fieldSource = fs.readFileSync(path.join(__dirname, '../screens/FieldActionScreen.js'), 'utf8');
  const fieldAst = ts.createSourceFile('FieldActionScreen.js', fieldSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let completion;
  function findCompletion(node) {
    if (ts.isVariableDeclaration(node) && node.name.text === 'completePhotoEdit') completion = node.initializer.getText(fieldAst);
    ts.forEachChild(node, findCompletion);
  }
  findCompletion(fieldAst); assert.ok(completion);
  let photos = [{ uri: 'https://server/photo.jpg', path: '/uploads/photo.jpg', type: 'before' }];
  const completePhoto = editedUri => new Function('photos', 'setPhotos', 'photoEditor', 'preservePhoto', 'key', 'closePhotoEditor', 'setStatus', 'statusFromRecords', `return (${completion});`)(
    photos, update => { photos = typeof update === 'function' ? update(photos) : update; }, { index: 0 }, (_, uri) => uri, 'draft', () => {}, () => {}, () => 'pending')(editedUri);
  completePhoto('https://server/photo.jpg'); assert.equal(photos[0].path, '/uploads/photo.jpg');
  completePhoto('file:///edited.jpg'); assert.equal(photos[0].path, null);

  const e = editor();
  assert.equal(e.button('자르기').props.accessibilityState.selected, true, 'crop is the default mode');
  await e.selectCrop();
  const first = e.photo();
  assert.deepEqual(e.calls[0].actions, [{ crop: { originX: 300, originY: 225, width: 900, height: 675 } }]);
  await e.selectCrop('bottomRight');
  const second = e.photo();
  assert.notEqual(first, second);
  await e.press('이전'); assert.equal(e.photo(), first, 'undo second crop only');
  await e.press('이전'); assert.equal(e.photo(), 'original', 'undo first crop');
  await e.press('이후'); assert.equal(e.photo(), first);
  await e.press('이후'); assert.equal(e.photo(), second);
  await e.press('펜'); e.draw();
  await e.press('이전');
  await e.press('회전');
  const rotated = e.photo();
  assert.equal(e.images.get(rotated).width, e.images.get(second).height);
  assert.ok(e.button('이후').props.disabled, 'a new edit discards redo history');
  await e.press('이전'); assert.equal(e.photo(), second);
  await e.press('이후'); assert.equal(e.photo(), rotated);
  await e.press('펜'); e.draw(); await e.press('자르기'); await e.selectCrop();
  assert.equal(e.images.get(e.photo()).marks, 1, 'cropping preserves ink');
  await e.press('이전'); assert.equal(e.photo(), rotated, 'undo crop restores the unflattened image and ink');
  await e.press('펜'); e.draw(); await e.press('저장');
  assert.equal(e.images.get(e.saved[0]).marks, 2, 'undo preserves previous ink and new ink stacks');
  await e.press('원본 복원'); assert.equal(e.photo(), 'original');
  assert.equal(e.saved.length, 1, 'restore does not save or close');

  const unchanged = editor(); await unchanged.press('저장');
  assert.equal(unchanged.saved[0], 'original', 'saving unchanged server image preserves identity');
  assert.equal(unchanged.calls.length, 0, 'full default crop is not another crop');

  const failed = editor(); failed.fail(); await failed.selectCrop();
  assert.equal(failed.photo(), 'original'); assert.equal(failed.alerts.length, 1);
  assert.ok(failed.button('이전').props.disabled, 'failed edits do not enter history');
  await failed.selectCrop(); assert.notEqual(failed.photo(), 'original', 'crop can retry');

  const stale = editor(); let resolve;
  stale.defer(new Promise(r => { resolve = r; }));
  const editing = stale.selectCrop(); stale.flush();
  assert.ok(stale.button('저장').props.disabled, 'parallel edits disabled');
  stale.change({ uri: 'next-photo' }); resolve(); await editing; stale.flush();
  assert.equal(stale.photo(), 'next-photo', 'old crop does not overwrite newly opened image');
  assert.ok(stale.button('이전').props.disabled, 'new session clears history');
  console.log('Photo editor checks passed: immediate crops, undo/redo across crop/pen/rotation, ink preservation, restore, failure and stale sessions');

})().catch(error => { console.error(error); process.exitCode = 1; });
