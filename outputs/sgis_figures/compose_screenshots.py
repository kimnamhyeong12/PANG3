from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

SRC=Path('C:/Users/t0102/Downloads');OUT=Path(__file__).parent
PREFIX='KakaoTalk_20260927_230245310'
BLUE='#245A81';INK='#202B35';GRAY='#56616B'
def ft(size,b=False):return ImageFont.truetype('C:/Windows/Fonts/malgun'+('bd' if b else '')+'.ttf',size)
def txt(d,t,x,y,size=34,b=False,color=INK):d.text((x,y),t,font=ft(size,b),fill=color,anchor='mm')
def source(suffix):return Image.open(SRC/(PREFIX+suffix+'.jpg')).convert('RGB')
def crop(suffix,rect):
 im=source(suffix);w,h=im.size
 return im.crop(tuple(round(v*(w/955 if i%2==0 else h/2048)) for i,v in enumerate(rect)))
def put(im,pic,rect):
 x,y,w,h=rect;pic=ImageOps.contain(pic,(w,h),Image.Resampling.LANCZOS)
 px=x+(w-pic.width)//2;py=y+(h-pic.height)//2
 im.paste(pic,(px,py));ImageDraw.Draw(im).rectangle((px,py,px+pic.width,py+pic.height),outline='#CAD3DB',width=2)
def save(im,name):im.save(OUT/name,dpi=(359,359))
def arrow(d,x,y):
 d.line((x-25,y,x+15,y),fill=BLUE,width=7);d.polygon([(x+30,y),(x+10,y-17),(x+10,y+17)],fill=BLUE)

im=Image.new('RGB',(2400,1450),'white');d=ImageDraw.Draw(im)
txt(d,'SGIS 행정동 경계와 시설별 위치 조회',1200,70,49,True)
txt(d,'동일한 다대2동에서 버스정류장과 AED를 조회',1200,138,33,color=GRAY)
for x,suffix,label in [(70,'_01','① 버스정류장 조회'),(1240,'','② AED 조회')]:
 txt(d,label,x+545,223,38,True,BLUE)
 put(im,crop(suffix,(15,90,940,1080)),(x,280,1090,1050))
txt(d,'SGIS 행정동 경계 안의 시설 위치를 종류별로 조회',1200,1385,32,color=GRAY)
save(im,'그림2_SGIS경계_버스정류장_AED조회.png')

im=Image.new('RGB',(2850,1500),'white');d=ImageDraw.Draw(im)
txt(d,'점검 대상 선택과 방문지 등록 및 담당자 지정',1425,75,49,True)
txt(d,'시설 선택부터 팀 업무 등록까지 이어지는 화면',1425,145,33,color=GRAY)
panels=[('_02',(25,960,930,1738),'① 점검할 시설 3건 선택','지도에서 고른 시설을 방문지로 등록'),('_03',(68,725,890,1323),'② 팀 방문지 등록 완료','선택한 3건을 팀 미배정 방문지로 등록'),('_04',(30,80,930,1140),'③ 담당자 지정 화면','구역별 또는 방문지별 담당자 지정')]
for i,(suffix,rect,title,cap) in enumerate(panels):
 x=65+i*940
 txt(d,title,x+420,250,36,True,BLUE)
 put(im,crop(suffix,rect),(x,330,840,930))
 txt(d,cap,x+420,1330,29,color=GRAY)
 if i<2:arrow(d,x+890,795)
txt(d,'등록된 방문지는 담당자 지정 화면에서 배정할 수 있음',1425,1430,29,color=GRAY)
save(im,'그림3_시설선택_등록_담당자지정.png')

im=Image.new('RGB',(2800,2050),'white');d=ImageDraw.Draw(im)
txt(d,'정해진 양식에 현장자료 입력 후 보고서 생성',1400,70,49,True)
txt(d,'위치도·현장사진·설명을 담은 보고서 양식 활용',1400,140,34,color=GRAY)
txt(d,'① 사진과 설명 입력',500,250,38,True,BLUE)
put(im,crop('_07',(36,201,915,1728)),(70,315,850,1475))
txt(d,'② 보고서 파일 열기',1390,250,38,True,BLUE)
put(im,crop('_08',(45,486,910,1050)),(1020,660,740,620))
txt(d,'③ 생성된 보고서',2310,250,38,True,BLUE)
put(im,crop('_09',(75,100,845,747)),(1875,330,860,715))
put(im,crop('_09',(76,1465,835,1997)),(1875,1080,860,615))
arrow(d,967,1030);arrow(d,1818,1030)
txt(d,'현장사진·설명을 양식에 입력',500,1880,30,color=GRAY)
txt(d,'생성된 보고서 파일 확인',1390,1880,30,color=GRAY)
txt(d,'위치도와 현장사진을 문서로 구성',2310,1880,30,color=GRAY)
txt(d,'동일한 다송중학교 버스정류장 사례의 입력 화면과 생성 결과',1400,1980,32,color=GRAY)
save(im,'그림4_보고서양식입력_생성결과.png')
print('Created figures 2, 3, 4')
