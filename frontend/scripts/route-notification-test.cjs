const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const source = babel.transformSync(fs.readFileSync(path.join(__dirname, '../services/notificationService.js'), 'utf8'), {
  configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const calls = [];
const preferences = new Map();
let permissionReader = async () => ({ granted: true });
const notifications = {
  setNotificationHandler() {},
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: () => permissionReader(),
  dismissNotificationAsync: async id => calls.push(['dismiss', id]),
  scheduleNotificationAsync: async data => calls.push(['schedule', data]),
};
let nativeAvailable = true;
const native = {
  showNativeRouteNotification: (title, body) => { if (!nativeAvailable) return false; calls.push(['native-show', title, body]); return true; },
  stopNativeRouteNotification: () => calls.push(['native-stop']),
};
const dependencies = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => preferences.get(key) ?? null, setItem: async (key, value) => preferences.set(key, value) } }, 'expo-notifications': notifications, 'expo-constants': {}, 'react-native': { Platform: { OS: 'android' } }, '../modules/kakao-navigation': native };
dependencies['../utils/auth'] = { apiFetch: () => { throw new Error('This notification lifecycle test must not call the backend'); } };
const api = {};
new Function('require', 'exports', source)(name => { assert.ok(name in dependencies); return dependencies[name]; }, api);
(async () => {
  preferences.set('pang3.task-alerts.1', 'off');
  assert.equal(await api.getTaskNotificationPreference(1), false);
  assert.equal((await api.syncPushTokenForUser(1)).reason, 'disabled', 'OFF survives token synchronization');
  const route = { from: '현재 위치', to: '방문지', duration: '10분', distance: '2km', remainingCount: 2 };
  assert.equal(await api.showRouteNotification(route), true);
  assert.equal(calls[0][0], 'native-show');
  assert.ok(calls[0][2].includes('남은 방문지 2곳'));
  assert.ok(!calls.some(call => call[0] === 'schedule'), 'native service replaces the persistent Expo notification');
  calls.length = 0;
  await api.stopRouteNotification();
  assert.deepEqual(calls.map(call => call[0]), ['native-stop', 'dismiss']);
  calls.length = 0;
  let resolvePermission;
  let permissionStarted;
  const ready = new Promise(resolve => { permissionStarted = resolve; });
  permissionReader = () => new Promise(resolve => { resolvePermission = resolve; permissionStarted(); });
  const pending = api.showRouteNotification(route);
  await ready;
  await api.stopRouteNotification();
  resolvePermission({ granted: true });
  assert.equal(await pending, false);
  assert.ok(!calls.some(call => call[0] === 'native-show' || call[0] === 'schedule'), 'a pending update must not recreate a stopped route notification');
  calls.length = 0;
  permissionReader = async () => ({ granted: false });
  assert.equal(await api.showRouteNotification(route), true, 'native lifecycle tracking survives denied notification permission');
  nativeAvailable = false;
  assert.equal(await api.showRouteNotification(route), false, 'old build fallback still respects denied notification permission');
  console.log('Route notification checks passed: native ownership, stop cleanup and delayed-update cancellation');
})().catch(error => { console.error(error); process.exitCode = 1; });
