"""Download the observed public ITS node/link archive; no login/application."""
import http.cookiejar
import json
import re
import ssl
import urllib.request
import zipfile
from pathlib import Path
from pip._vendor import truststore

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison'
record=json.loads((OUT/'its-files.json').read_text(encoding='utf-8'))['body']['data']['fileVOList'][0]
destination=OUT/'its-node-link-2026-10-14.zip'
context=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=context),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
if not destination.exists():
    # This is the same public download URL published by nodelinkService.js.
    url='https://www.its.go.kr/opendata/nodelinkFileSDownload/'+record['atchFileId']+'/'+record['nodeFileSeq']
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.its.go.kr/nodelink/nodelinkRef'})
    partial=destination.with_suffix('.zip.partial')
    with opener.open(request,timeout=90) as response,partial.open('wb') as target:
        total=last=0
        while block:=response.read(1024*1024):
            target.write(block);total+=len(block)
            if total-last>=32*1024*1024:
                print(f'DOWNLOADED {total//1024//1024} MiB',flush=True);last=total
    if not zipfile.is_zipfile(partial):raise RuntimeError('Public endpoint did not return a ZIP archive')
    partial.replace(destination)
with zipfile.ZipFile(destination) as archive:
    print(json.dumps([dict(name=i.filename,bytes=i.file_size) for i in archive.infolist()],ensure_ascii=True),flush=True)
print('READY '+str(destination),flush=True)
