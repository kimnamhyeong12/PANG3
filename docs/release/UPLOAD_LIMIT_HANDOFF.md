# 사진 신청이 Nginx 413으로 차단될 때

앱 API 앞의 Nginx가 요청 크기를 먼저 제한하면 Java의 사진 검증까지 도달하지 못한다.
현재 앱은 원본 사진 한 장 15MiB, 문의 첨부 합계 30MiB를 허용하며,
Java 서버의 multipart 요청 상한은 60MiB다.

서버 담당자가 실제 API 요청을 받는 Nginx 설정을 확인한 뒤 다음을 적용한다.

1. `sudo nginx -T`로 활성 HTTPS `server` 및 해당 `/api` 프록시 설정의
   `client_max_body_size`를 확인한다. 설정 전체에는 비밀값이 포함될 수 있으므로 공개하지 않는다.
2. 해당 HTTPS `server` 블록에 `client_max_body_size 60m;`을 설정한다.
   `infra/nginx/pinwork-upload-limits.conf`가 포함할 수 있는 설정 조각이다.
   하위 `location`에서 더 작은 값을 지정했다면 해당 값도 정렬한다.
3. `sudo nginx -t`가 성공하면 `sudo systemctl reload nginx`로 반영한다.
   설정 검증 실패 시 reload하지 말고 이전 정상 설정을 유지한다.
4. 승인된 테스트 계정으로 1MiB를 넘는 GPS 원본 사진 접수와 문의 첨부를 확인한다.
   15MiB를 넘는 단일 파일은 기존 앱·서버 제한대로 거부되어야 한다.

이 파일과 설정 조각을 Git에 올리는 것만으로 운영 Nginx 설정이 바뀌지는 않는다.
DB 변경이나 사진 재인코딩으로 해결하는 문제가 아니며, 원본 GPS를 보존해야 하므로
이 오류를 피하려고 시설물 증빙 사진을 임의로 압축·재인코딩하지 않는다.
