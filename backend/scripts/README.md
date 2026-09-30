# 부산 출입구 데이터 준비

프로젝트 루트에서 다음 명령으로 제공받은 부산 ZIP을 가공합니다.

```powershell
python backend/scripts/prepare_busan_entrances.py 'C:\Users\t0102\Downloads\부산광역시.zip'
```

결과는 `backend/data/busan-entrances.jsonl.gz`에 저장됩니다. 원본 ZIP과 결과 파일은 Git에 추가하지 않습니다. 백엔드는 시작할 때 이 파일을 읽으며, Docker Compose는 `backend/data`를 컨테이너의 `/app/data`에 읽기 전용으로 연결합니다. 서버에 적용할 때는 결과 파일을 서버의 `backend/data`에도 놓고 백엔드를 재시작해야 합니다. 다른 경로에 두는 경우 `BUSAN_ENTRANCE_DATA_PATH` 환경변수로 지정할 수 있습니다.

이 데이터의 출입구에는 차량/보행자 구분이 없습니다. 경로 API가 출입구 근처까지 안내한 뒤 방문지 마커까지 그리는 점선은 직선 연결이며, 실제 통행 가능한 보행 경로를 뜻하지 않습니다. 자료 이용 조건은 별도로 확인해야 합니다.
