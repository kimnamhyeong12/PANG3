# Build context is the repository root. See .github/workflows/deploy.yml.

FROM python:3.11-slim-bookworm AS report-runtime
WORKDIR /source
COPY tools/build_report_runtime.py tools/build_report_runtime.py
COPY ai/app.py ai/compiled_report.py ai/hwpx_images.py ai/
COPY ai/templates/template.hwpx ai/templates/template.hwpx
COPY backend/src/main/resources/report-marker-layout.js backend/src/main/resources/report-marker-layout.js
COPY frontend/utils/reportMapPlan.js frontend/utils/reportMapPlan.js
RUN python tools/build_report_runtime.py

# 1) Spring Boot build
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build/backend

COPY backend/pom.xml ./pom.xml
RUN mvn -B dependency:go-offline

COPY backend/src ./src
COPY --from=report-runtime /source/backend/src/main/resources/static/report-runtime/ ./src/main/resources/static/report-runtime/
RUN mvn -B clean package -DskipTests

# 2) Runtime: Java + Python AI engine in the SAME container.
# This removes the fragile /app/ai/venv/bin/python host-path dependency.
FROM python:3.11-slim-bookworm

# fontconfig + fonts-dejavu-core: 보고서 위치도(StaticMapService)가 핀 번호를 그릴 때 필요 (slim 이미지엔 글꼴이 없음)
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless libheif1 fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai/requirements.txt /app/ai/requirements.txt
RUN pip install --no-cache-dir -r /app/ai/requirements.txt

COPY ai/app.py /app/ai/app.py
COPY ai/compiled_report.py /app/ai/compiled_report.py
COPY ai/hwpx_images.py /app/ai/hwpx_images.py
COPY ai/create_template.py /app/ai/create_template.py
COPY ai/templates /app/ai/templates
RUN mkdir -p /app/ai/uploads /app/ai/output

COPY --from=build /build/backend/target/*.jar /app/app.jar

ENV FIELDWORK_AI_PYTHON_PATH=/usr/local/bin/python \
    FIELDWORK_AI_SCRIPT_PATH=/app/ai/app.py \
    FIELDWORK_AI_OUTPUT_DIR=/app/ai/output \
    FIELDWORK_UPLOAD_BASE_DIR=/app/ai/uploads

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
