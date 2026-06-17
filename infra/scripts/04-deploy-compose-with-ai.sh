#!/usr/bin/env bash
# EC2에서 docker compose + AI 볼륨 설정으로 기동
# 사용: cd /home/ubuntu/PANG3 && ./infra/scripts/04-deploy-compose-with-ai.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

AI_DIR="$PROJECT_ROOT/ai"
echo "▶ AI 폴더 준비 확인"
if [[ ! -f "$AI_DIR/venv/bin/python" ]]; then
  echo "   venv 없음 → 03-setup-ec2-ai.sh 먼저 실행"
  "$SCRIPT_DIR/03-setup-ec2-ai.sh"
fi

echo "▶ docker compose (기본 + AI 오버레이)"
docker compose -f docker-compose.yml -f docker-compose.ai.yml pull
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d

echo "✅ 기동 완료"
docker compose ps
