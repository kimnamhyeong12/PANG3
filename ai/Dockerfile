# AI 보고서 엔진 단독 이미지 (선택)
# docker compose -f docker-compose.yml -f docker-compose.ai.yml --profile ai-tools run --rm ai \
#   python app.py samples/garak_sample.json

FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY samples/ ./samples/

RUN mkdir -p /app/output /app/uploads

ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py", "samples/garak_sample.json"]
