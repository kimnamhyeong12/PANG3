#!/usr/bin/env bash
# 사용법: ./run.sh [samples/garak_sample.json]
set -euo pipefail
cd "$(dirname "$0")"

if [[ -d "venv/bin" ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

SAMPLE="${1:-samples/garak_sample.json}"
python app.py "$SAMPLE"
