#!/usr/bin/env bash
# 백엔드 또는 EC2에서 AI 보고서 1건 생성 (SSM 키 자동 로드)
# 사용:
#   ./infra/scripts/run-ai-report.sh ai/samples/garak_sample.json
#   ./infra/scripts/run-ai-report.sh '{"location_name":"테스트",...}'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI_DIR="$PROJECT_ROOT/ai"

PAYLOAD="${1:-samples/garak_sample.json}"

# SSM에서 키 로드 (실패 시 ai/.env 의 dotenv 사용)
if [[ -f "$SCRIPT_DIR/load-gemini-key.sh" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/load-gemini-key.sh" 2>/dev/null || true
fi

# shellcheck disable=SC1091
source "$AI_DIR/venv/bin/activate"

cd "$AI_DIR"
python app.py "$PAYLOAD"
