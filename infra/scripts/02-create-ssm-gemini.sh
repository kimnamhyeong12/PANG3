#!/usr/bin/env bash
# Gemini API 키를 AWS SSM Parameter Store 에 저장
# ⚠️ 키는 터미널에서만 입력합니다. 스크립트/깃에 저장하지 마세요.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$INFRA_DIR/config.env" ]]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/config.env"
else
  echo "❌ infra/config.env 가 없습니다."
  exit 1
fi

: "${SSM_GEMINI_PARAM:?SSM_GEMINI_PARAM 를 config.env 에 설정하세요}"
: "${AWS_REGION:=ap-northeast-2}"

echo "▶ SSM 파라미터: ${SSM_GEMINI_PARAM}"
echo "   (값은 화면에 표시되지 않습니다)"

read -rsp "GEMINI_API_KEY 입력: " API_KEY
echo ""

if [[ -z "$API_KEY" ]]; then
  echo "❌ 빈 값은 저장할 수 없습니다."
  exit 1
fi

aws ssm put-parameter \
  --region "$AWS_REGION" \
  --name "$SSM_GEMINI_PARAM" \
  --value "$API_KEY" \
  --type SecureString \
  --overwrite

echo "✅ SSM 저장 완료 (키 값은 출력하지 않음)"
echo "   EC2에서 읽기: ./infra/scripts/load-gemini-key.sh"
