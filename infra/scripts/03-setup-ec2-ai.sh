#!/usr/bin/env bash
# EC2 서버에서 실행: Python venv + ai 패키지 설치
# 사용 (EC2 SSH 후):
#   cd /home/ubuntu/PANG3 && ./infra/scripts/03-setup-ec2-ai.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI_DIR="$PROJECT_ROOT/ai"

echo "▶ 프로젝트: $PROJECT_ROOT"

if ! command -v python3 &>/dev/null; then
  echo "▶ python3 설치"
  sudo apt-get update -qq
  sudo apt-get install -y python3 python3-venv python3-pip
fi

mkdir -p "$AI_DIR/output" "$AI_DIR/uploads"

echo "▶ venv 생성: $AI_DIR/venv"
python3 -m venv "$AI_DIR/venv"
# shellcheck disable=SC1091
source "$AI_DIR/venv/bin/activate"
pip install --upgrade pip -q
pip install -r "$AI_DIR/requirements.txt" -q

echo "▶ 로컬 .env (SSM 미사용 시에만)"
if [[ ! -f "$AI_DIR/.env" ]]; then
  cp "$AI_DIR/.env.example" "$AI_DIR/.env"
  echo "   ai/.env 생성됨 — SSM 쓰면 키 없이 load-gemini-key.sh 사용 가능"
fi

echo ""
echo "✅ EC2 AI 환경 설치 완료"
echo "   테스트: cd $PROJECT_ROOT && source infra/scripts/load-gemini-key.sh && ./ai/run.sh"
