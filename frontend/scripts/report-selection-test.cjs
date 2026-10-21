const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const React = require('react');
const hooks = { ...React, useState: initial => [initial, () => {}] };
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const code = babel.transformSync(source, { filename: path.join(__dirname, file), configFile: false, babelrc: false,
    presets: ['babel-preset-expo'], plugins: ['@babel/plugin-transform-modules-commonjs'] }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react-native') return new Proxy({ StyleSheet: { create: x => x } }, { get: (o, k) => o[k] || String(k) });
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('/ui')) return { ScreenHeader: 'ScreenHeader', PrimaryButton: 'PrimaryButton' };
    if (name.endsWith('/CustomAlert')) return { showAlert() {} };
    if (name.startsWith('@babel/runtime/') || name === 'react/jsx-runtime') return require(name);
    if (dependencies[name]) return dependencies[name];
    throw Error(`Unexpected import ${name}`);
  } }, { filename: file });
  return module.exports;
}
const design = load('../constants/design.js');
const Screen = load('../screens/ReportListScreen.js', { '../constants/design': design }).default;
const locations = ['pending', 'working', 'complete'].map((status, index) => ({
  id: index + 1, status, detailAddress: `방문지 ${index + 1}`, workDate: '2026-10-16',
}));
const props = { locations, selectedIds: [], onSelectionChange: ids => { props.selectedIds = ids; },
  onSelectLocation: item => { edited = item.id; }, onCreateReport: rows => { generated = rows; } };
let edited = null, generated = null, tree;
const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const render = () => { tree = Screen(props); return nodes(tree); };
const find = label => render().find(n => n.props?.accessibilityLabel === label);
assert.equal(find('방문지 1 보고서 생성 대상 선택, 작업 시작 후 선택 가능').props.disabled, true);
assert.equal(find('방문지 2 보고서 생성 대상 선택').props.disabled, false);
find('방문지 1 보고서 양식 열기').props.onPress();
assert.equal(edited, 1, 'pending cards also open the report form');
find('방문지 2 보고서 생성 대상 선택').props.onPress();
assert.deepEqual(Array.from(props.selectedIds), [2]);
find('방문지 2 보고서 양식 열기').props.onPress();
assert.equal(edited, 2);
assert.deepEqual(Array.from(props.selectedIds), [2], 'editing must not toggle selection');
find('방문지 3 보고서 양식 열기').props.onPress();
assert.equal(edited, 3);
find('방문지 3 보고서 생성 대상 선택').props.onPress();
const button = render().find(n => n.type === 'PrimaryButton');
assert.equal(button.props.title, '2건 보고서 만들기');
button.props.onPress();
assert.deepEqual(Array.from(generated, row => row.id), [2, 3]);
find('방문지 2 보고서 생성 대상 선택').props.onPress();
assert.deepEqual(Array.from(props.selectedIds), [3]);
const { coordinateInput } = load('../utils/coordinateInput.js');
assert.equal(coordinateInput('-', '129'), null);
assert.equal(coordinateInput('35.', '129'), null);
assert.equal(coordinateInput('', ''), null);
assert.equal(coordinateInput('91', '129'), null);
assert.equal(coordinateInput('35', '181'), null);
assert.equal(coordinateInput('NaN', '129'), null);
assert.deepEqual(JSON.parse(JSON.stringify(coordinateInput('-35.1', '129.123456'))), { lat: -35.1, lng: 129.123456 });
console.log('Report selection checks passed: all status cards open forms, independent selection, pending generation disabled and coordinate validation');
