# 1. 가벼운 웹 서버인 Nginx를 기반으로 합니다
FROM nginx:alpine

# 2. 우리가 만든 index.html을 Nginx의 웹 경로로 복사합니다
COPY index.html /usr/share/nginx/html/index.html

# 3. 80번 포트를 열어줍니다
EXPOSE 80