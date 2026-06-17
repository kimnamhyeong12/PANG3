# 클라우드 인프라 (AI + S3 + SSM + EC2)

> API 키는 **절대 git에 넣지 마세요.**  
> `infra/config.env`, `ai/.env` 만 사용합니다.

---

## 미리 만들어 둔 것

| 파일 | 용도 |
|------|------|
| `scripts/01-create-s3-bucket.sh` | **2. S3** 버킷 생성 |
| `scripts/02-create-ssm-gemini.sh` | **3. SSM** Gemini 키 저장 |
| `scripts/03-setup-ec2-ai.sh` | **4. EC2** Python + venv 설치 |
| `scripts/04-deploy-compose-with-ai.sh` | EC2에서 docker + AI 볼륨 기동 |
| `scripts/run-ai-report.sh` | 보고서 1건 생성 (백엔드에서도 호출 가능) |
| `scripts/load-gemini-key.sh` | SSM → `GEMINI_API_KEY` export |
| `../docker-compose.ai.yml` | 백엔드에 `ai/` 폴더 마운트 |
| `iam/*.json` | EC2 IAM 역할에 붙일 정책 **템플릿** |

---

## 처음 한 번만 (로컬 PC, aws cli 설정 후)

```bash
cp infra/config.env.example infra/config.env
# config.env 에 S3_BUCKET_NAME 등 수정

chmod +x infra/scripts/*.sh

./infra/scripts/01-create-s3-bucket.sh
./infra/scripts/02-create-ssm-gemini.sh   # 키는 터미널에만 입력
```

### IAM (콘솔에서 1회)

1. EC2 인스턴스 **IAM Role** 생성/연결  
2. `infra/iam/ec2-s3-policy.json` → `BUCKET_NAME_PLACEHOLDER` 를 실제 버킷명으로 바꿔 연결  
3. `infra/iam/ec2-ssm-read-policy.json` → `ACCOUNT_ID_PLACEHOLDER` 를 AWS 계정 ID로 바꿔 연결  

---

## EC2 서버에서 (SSH 접속 후)

```bash
cd /home/ubuntu/PANG3
git pull

./infra/scripts/03-setup-ec2-ai.sh
source infra/scripts/load-gemini-key.sh
./infra/scripts/run-ai-report.sh ai/samples/garak_sample.json

./infra/scripts/04-deploy-compose-with-ai.sh
```

---

## 백엔드 연동 경로 (컨테이너 안)

| 환경변수 | 값 |
|----------|-----|
| `FIELDWORK_AI_PYTHON_PATH` | `/app/ai/venv/bin/python` |
| `FIELDWORK_AI_SCRIPT_PATH` | `/app/ai/app.py` |
| `FIELDWORK_UPLOAD_BASE_DIR` | `/app/ai/uploads` |
| `FIELDWORK_AI_OUTPUT_DIR` | `/app/ai/output` |

상세 JSON 스키마: `ai/INTEGRATION.md`

---

## S3 경로 규칙 (백엔드 참고)

```
s3://{버킷}/uploads/{locationId}/map.jpg
s3://{버킷}/uploads/{locationId}/photo_0.jpg
s3://{버킷}/reports/{locationId}_{날짜}.hwp
```

`app.py` 호출 전에 S3 → `/app/ai/uploads/...` 로 받아 **절대경로**를 JSON에 넣으세요.

---

## 로컬 Docker 테스트 (선택)

```bash
export GEMINI_API_KEY=...   # 또는 ai/.env
docker compose -f docker-compose.yml -f docker-compose.ai.yml --profile ai-tools run --rm ai
```
