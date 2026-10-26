"""Fetch public catalog pages only; do not log in, submit applications or send messages."""
import html
import json
import re
import urllib.request
import ssl
import sys
import http.cookiejar
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tmp/domestic-road-comparison';OUT.mkdir(parents=True,exist_ok=True)
from pip._vendor import truststore
context=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
pages={
 'its':'https://www.its.go.kr/nodelink/nodelinkStatus?service=inquiryNodelink',
 'juso':'https://business.juso.go.kr/',
 'its-ref':'https://www.its.go.kr/nodelink/nodelinkRef',
 'its-inquiry-js':'https://www.its.go.kr/js/nodelink/inquiryNodelink.js?t=202306221534',
 'juso-app':'https://business.juso.go.kr/assets/index-8040c928.js',
 'its-service':'https://www.its.go.kr/js/opendata/nodelinkService.js',
 'its-common':'https://www.its.go.kr/js/opendata/opendataCommon.js',
 'juso-download':'https://business.juso.go.kr/assets/JstAddressDetailsSearch-b536b035.js',
 'its-ajax':'https://www.its.go.kr/js/common/common.js',
 'bdi-roads':'https://data.bdi.re.kr/data/map/view.do?boardId=1&division=%EB%8F%84%EC%8B%9C&gubun=city&metaInfoId=1948&page=4&searchCategory=&searchTxt=&searchYear=&subDivision=',
 'its-criteria-pdf':'https://www.codil.or.kr/filebank/moct2014/202301/MOCT3000_1.PDF?nserialno=3000',
}
for name,url in pages.items():
    try:
        if (OUT/(name+'.html')).exists():
            continue
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; RoadDataResearch/1.0)'})
        with urllib.request.urlopen(req,timeout=25,context=context) as response:
            body=response.read();encoding=response.headers.get_content_charset() or 'utf-8'
        if body.startswith(b'%PDF'):
            (OUT/(name+'.pdf')).write_bytes(body);print(name+' PDF '+str(len(body)),flush=True);continue
        text=body.decode(encoding,errors='replace');(OUT/(name+'.html')).write_text(text,encoding='utf-8')
        links=re.findall(r'(?:href|src)=["\']([^"\']+)',text)
        selected=[html.unescape(link) for link in links if any(word in link.lower() for word in ['node','link','down','file','offer','data','board','js/','.js'])]
        print(json.dumps(dict(site=name,bytes=len(body),links=selected[:70]),ensure_ascii=False),flush=True)
    except Exception as error:
        print(json.dumps(dict(site=name,error=str(error)),ensure_ascii=False),flush=True)

catalogs={
 'its-files':('https://www.its.go.kr/opendata/getNodeLinkDataFileList',{'body':{'data':{'searchType':-1,'workingDirectory':'/nodeLink','startDate':'2026-10-01','endDate':'2026-10-26'}}}),
 'juso-catalog':('https://business.juso.go.kr/api/jst/selectBabsRtlDtaDtlList',{}),
}
for name,(url,payload) in catalogs.items():
    destination=OUT/(name+'.json')
    if destination.exists():continue
    try:
        headers={'User-Agent':'Mozilla/5.0','Content-Type':'application/json','Referer':url.split('/api/')[0]+'/'}
        opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=context),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if name=='its-files':
            landing='https://www.its.go.kr/nodelink/nodelinkRef'
            with opener.open(landing,timeout=25) as response:page=response.read().decode('utf-8',errors='replace')
            meta=dict(re.findall(r'<meta\s+name="([^"]+)"\s+content="([^"]*)"',page))
            if meta.get('_csrf_header') and meta.get('_csrf'):headers[meta['_csrf_header']]=meta['_csrf']
            headers.update(Referer=landing,Origin='https://www.its.go.kr')
            headers['X-Requested-With']='XMLHttpRequest'
        request=urllib.request.Request(url,data=json.dumps(payload).encode(),headers=headers)
        with opener.open(request,timeout=30) as response:result=json.load(response)
        destination.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(name+' '+json.dumps(result,ensure_ascii=True)[:4500],flush=True)
    except Exception as error:
        print(name+' '+str(error),flush=True)
