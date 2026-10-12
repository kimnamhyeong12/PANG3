const fs = require('fs');
const path = require('path');
const { withAndroidManifest } = require('@expo/config-plugins');
const config = require('./app.json').expo;

// EAS can supply this as a build environment variable. Local prebuilds may use .env.
function nativeAppKey() {
  if (process.env.KAKAO_NATIVE_APP_KEY) return process.env.KAKAO_NATIVE_APP_KEY;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return '';
  const match = fs.readFileSync(envPath, 'utf8').match(/^KAKAO_NATIVE_APP_KEY\s*=\s*(.*)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function withKakaoNavigationKey(expoConfig) {
  return withAndroidManifest(expoConfig, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;
    const metadata = application['meta-data'] || [];
    const name = 'com.pang3.KAKAO_NATIVE_APP_KEY';
    application['meta-data'] = metadata.filter((item) => item.$?.['android:name'] !== name);
    application['meta-data'].push({
      $: { 'android:name': name, 'android:value': nativeAppKey() },
    });
    return mod;
  });
}

module.exports = { ...config, plugins: [...config.plugins, withKakaoNavigationKey] };
