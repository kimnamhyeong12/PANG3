const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.join(__dirname, '..');
const config = require('../app.json').expo;
const google = require('@expo/config-plugins/build/android/GoogleServices');
assert.equal(config.android.googleServicesFile, './google-services.json');
assert.match(google.setClassPath(config, 'dependencies { }'), /com.google.gms:google-services/);
assert.match(google.applyPlugin(config, ''), /com.google.gms.google-services/);

let granted = true;
let tokenFailure = false;
let backendStatus = 200;
const registrations = [];
const preferences = new Map();
const notifications = {
  setNotificationHandler() {},
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  setNotificationChannelAsync: async () => {},
  getPermissionsAsync: async () => ({ granted, status: granted ? 'granted' : 'denied' }),
  getExpoPushTokenAsync: async () => {
    if (tokenFailure) throw Error('Default FirebaseApp is not initialized');
    return { data: 'ExponentPushToken[test-only]' };
  },
};
const dependencies = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: {
    getItem: async key => preferences.get(key) ?? null,
    setItem: async (key, value) => preferences.set(key, value),
  } },
  'expo-notifications': notifications,
  'expo-constants': { __esModule: true, default: { expoConfig: config } },
  'react-native': { Platform: { OS: 'android' } },
  '../modules/kakao-navigation': {},
  '../utils/auth': { apiFetch: async (url, options) => {
    registrations.push(JSON.parse(options.body));
    return { ok: backendStatus === 200, status: backendStatus, text: async () => '' };
  } },
};
process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.invalid';
const source = babel.transformSync(fs.readFileSync(path.join(root, 'services/notificationService.js'), 'utf8'), {
  configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const api = {};
new Function('require', 'exports', source)(name => {
  assert.ok(name in dependencies, name);
  return dependencies[name];
}, api);
(async () => {
  granted = false;
  assert.equal((await api.syncPushTokenForUser(2)).reason, 'token-unavailable');
  assert.equal(registrations.length, 0);
  granted = true;
  tokenFailure = true;
  assert.equal((await api.syncPushTokenForUser(2)).reason, 'token-unavailable');
  assert.equal(registrations.length, 0);
  tokenFailure = false;
  assert.equal((await api.syncPushTokenForUser({ userId: 2 })).success, true);
  assert.equal(registrations[0].userId, 2);
  assert.equal(registrations[0].platform, 'android');
  backendStatus = 404;
  assert.equal((await api.syncPushTokenForUser(2)).reason, 'backend-not-ready');
  preferences.set('pang3.task-alerts.2', 'off');
  const before = registrations.length;
  assert.equal((await api.syncPushTokenForUser(2)).reason, 'disabled');
  assert.equal(registrations.length, before);
  console.log('Push checks passed: Firebase config, permission, initialization failure, recipient registration, backend failure, disabled alerts');
})().catch(error => { console.error(error); process.exitCode = 1; });
