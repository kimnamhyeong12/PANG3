#!/usr/bin/env bash
# Build the web and update the document root used by the actual production domain.
set -euo pipefail
project_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$project_root/web"
npm ci --no-audit --no-fund
npm run build

web_root="$(python3 - <<'PY'
import os, re, subprocess
config = subprocess.check_output(['sudo', 'nginx', '-T'], stderr=subprocess.DEVNULL, text=True)
roots = set()
for start in re.finditer(r'\bserver\s*\{', config):
    depth, end = 1, start.end()
    while end < len(config) and depth:
        depth += (config[end] == '{') - (config[end] == '}')
        end += 1
    block = config[start.end():end-1]
    names = re.findall(r'\bserver_name\s+([^;]+);', block)
    if not any('pinwork.co.kr' in name.split() for name in names):
        continue
    for value in re.findall(r'\broot\s+([^;]+);', block):
        path = os.path.realpath(value.strip().strip('"\''))
        if path.startswith(('/var/www/', '/srv/')) or path == '/home/ubuntu/PANG3/web/dist':
            roots.add(path)
if len(roots) != 1:
    raise SystemExit('Cannot identify one static document root for pinwork.co.kr; no site files were changed.')
print(roots.pop())
PY
)"
test -d "$web_root"
test -f dist/index.html
echo "Deploying web to Nginx document root: $web_root"
if [ "$web_root" != "$project_root/web/dist" ]; then
  backup_dir="$project_root/../deploy-backups/web-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$backup_dir"
  if sudo test -f "$web_root/index.html"; then
    sudo cp "$web_root/index.html" "$backup_dir/index.html"
  fi
  # Keep old hashed assets for browsers that still have the previous HTML open.
  sudo cp -a dist/. "$web_root/"
fi
