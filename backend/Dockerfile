# 1단계: Maven으로 빌드 (mvnw가 없어서 Maven 이미지를 그대로 사용)
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# 의존성 먼저 받아서 캐시 활용
COPY pom.xml .
RUN mvn -B dependency:go-offline

# 소스 복사 후 빌드
COPY src ./src
RUN mvn -B clean package -DskipTests

# 2단계: 빌드된 jar만 담아서 실제 실행 이미지 생성
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# application.yml의 server.port와 동일하게 맞춤
EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]
