#!/usr/bin/env bash
# SSM에서 GEMINI_API_KEY 를 읽어 환경변수로 export (키 값은 출력하지 않음)
# 사용: source ./infra/scripts/load-gemini-key.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$INFRA_DIR/config.env" ]]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/config.env"
fi

: "${SSM_GEMINI_PARAM:=/sahagu/gemini/api-key}"
: "${AWS_REGION:=ap-northeast-2}"

export GEMINI_API_KEY
GEMINI_API_KEY="$(aws ssm get-parameter \
  --region "$AWS_REGION" \
  --name "$SSM_GEMINI_PARAM" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text)"

if [[ -z "$GEMINI_API_KEY" ]]; then
  echo "❌ SSM에서 키를 가져오지 못했습니다: $SSM_GEMINI_PARAM" >&2
  return 1 2>/dev/null || exit 1
fi

echo "✅ GEMINI_API_KEY 로드됨 (값은 표시하지 않음)"
