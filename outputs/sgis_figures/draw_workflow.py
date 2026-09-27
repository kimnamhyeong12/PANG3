from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).parent
W,H=2550,600
im=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(im)
blue='#245A81';ink='#202B35';gray='#52606B'
def f(n,b=False):return ImageFont.truetype('C:/Windows/Fonts/malgun'+('bd' if b else '')+'.ttf',n)
def center(text,x,y,font,color=ink):
 d.text((x,y),text,font=font,fill=color,anchor='mm')

steps=[('담당 구역 선택',['SGIS 행정동 경계','확인']),('시설 위치 조회',['버스정류장 · AED','점검 대상 선택']),('업무 등록 및 배정',['방문지 등록','담당자 지정']),('이동 및 현장점검',['방문 경로 확인','시설 상태 점검']),('현장 기록',['사진 · 메모','점검 결과 저장']),('보고서 작성',['위치도 · 사진 · 설명','담당자 검토'])]
left=45;bw=365;gap=54;y=130;bh=300
for i,(title,desc) in enumerate(steps):
 x=left+i*(bw+gap)
 d.rounded_rectangle((x,y,x+bw,y+bh),radius=15,fill='#F2F7FA' if i<2 else '#FFFFFF',outline=blue if i<2 else '#8C969E',width=3)
 center(f'{i+1:02}',x+bw/2,y+44,f(33,True),blue if i<2 else gray)
 center(title,x+bw/2,y+106,f(35,True))
 for j,t in enumerate(desc):center(t,x+bw/2,y+181+j*51,f(29),gray)
 if i<5:
  ax=x+bw+12;ay=y+bh/2;end=x+bw+gap-12
  d.line((ax,ay,end-8,ay),fill=gray,width=5)
  d.polygon([(end,ay),(end-13,ay-12),(end-13,ay+12)],fill=gray)
start=left;end=left+2*bw+gap
d.line((start+10,90,end-10,90),fill=blue,width=3)
d.line((start+10,90,start+10,111),fill=blue,width=3)
d.line((end-10,90,end-10,111),fill=blue,width=3)
center('SGIS 행정경계 활용',(start+end)/2,49,f(33,True),blue)
center('현재 시설 위치 조회 대상: 버스정류장 · AED',W/2,502,f(32,True),ink)
center('시설별 연동 범위에 따라 조회 결과를 점검 업무와 연결',W/2,552,f(27),gray)
out=root/'그림1_전체업무흐름도.png'
im.save(out,dpi=(381,381))
print(out)
