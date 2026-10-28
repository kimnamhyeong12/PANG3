// Run after changing runtime dependencies. No network requests are made.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const entries = new Map();
for (const [relative, entry] of Object.entries(lock.packages)) {
  if (!relative || entry.dev || entry.link) continue;
  const directory = path.join(root, relative);
  const manifestPath = path.join(directory, 'package.json');
  if (!fs.existsSync(manifestPath)) {
    if (entry.optional && (entry.os || entry.cpu)) continue;
    throw new Error(`Install dependencies first: ${relative}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name || entries.has(`${manifest.name}@${manifest.version}`)) continue;
  const files = fs.readdirSync(directory).filter(name => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  const notice = files.map(name => fs.readFileSync(path.join(directory, name), 'utf8').trim()).join('\n\n');
  entries.set(`${manifest.name}@${manifest.version}`, { name: manifest.name, version: manifest.version,
    license: typeof manifest.license === 'string' ? manifest.license : manifest.license?.type || entry.license || '배포 라이선스 참조', notice });
}
const output = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
fs.writeFileSync(path.join(root, 'constants/openSourceLicenses.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated notices for ${output.length} runtime packages.`);
