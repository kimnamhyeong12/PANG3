#!/usr/bin/env bash
# S3 버킷 생성 (로컬 PC 또는 EC2에서 aws cli 로 실행)
# 사용: cp infra/config.env.example infra/config.env 후 값 수정 → ./infra/scripts/01-create-s3-bucket.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$INFRA_DIR/config.env" ]]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/config.env"
else
  echo "❌ infra/config.env 가 없습니다. config.env.example 을 복사하세요."
  exit 1
fi

: "${S3_BUCKET_NAME:?S3_BUCKET_NAME 를 config.env 에 설정하세요}"
: "${AWS_REGION:=ap-northeast-2}"

echo "▶ 버킷 생성: s3://${S3_BUCKET_NAME} (region: ${AWS_REGION})"

if aws s3api head-bucket --bucket "$S3_BUCKET_NAME" 2>/dev/null; then
  echo "   이미 존재합니다. 건너뜁니다."
else
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION"
  else
    aws s3api create-bucket \
      --bucket "$S3_BUCKET_NAME" \
      --region "$AWS_REGION" \
      --create-bucket-configuration "LocationConstraint=${AWS_REGION}"
  fi
  echo "   생성 완료"
fi

echo "▶ 폴더 prefix (빈 객체로 구조만 생성)"
for prefix in uploads/ reports/; do
  aws s3api put-object --bucket "$S3_BUCKET_NAME" --key "${prefix}" --body /dev/null 2>/dev/null || \
    echo "" | aws s3 cp - "s3://${S3_BUCKET_NAME}/${prefix}.keep" 2>/dev/null || true
done

echo "▶ (선택) CORS 적용 — 앱이 S3에 직접 올릴 때만"
if [[ -f "$INFRA_DIR/s3/cors.json" ]]; then
  aws s3api put-bucket-cors \
    --bucket "$S3_BUCKET_NAME" \
    --cors-configuration "file://${INFRA_DIR}/s3/cors.json" || echo "   CORS 적용 실패 시 콘솔에서 수동 설정"
fi

echo ""
echo "✅ S3 준비 완료"
echo "   업로드 경로 예: s3://${S3_BUCKET_NAME}/uploads/{locationId}/"
echo "   보고서 경로 예: s3://${S3_BUCKET_NAME}/reports/"
