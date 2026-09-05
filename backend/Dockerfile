# Build context is the repository root. See .github/workflows/deploy.yml.

# 1) Spring Boot build
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build/backend

COPY backend/pom.xml ./pom.xml
RUN mvn -B dependency:go-offline

COPY backend/src ./src
RUN mvn -B clean package -DskipTests

# 2) Runtime: Java + Python AI engine in the SAME container.
# This removes the fragile /app/ai/venv/bin/python host-path dependency.
FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless libheif1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ai/requirements.txt /app/ai/requirements.txt
RUN pip install --no-cache-dir -r /app/ai/requirements.txt

COPY ai/app.py /app/ai/app.py
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
