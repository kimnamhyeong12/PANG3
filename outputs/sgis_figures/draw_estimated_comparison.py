from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).parent
im=Image.new('RGB',(2400,1250),'white');d=ImageDraw.Draw(im)
ink='#202B35';gray='#56616B';blue='#245A81'
def font(size,bold=False):return ImageFont.truetype('C:/Windows/Fonts/malgun'+('bd' if bold else '')+'.ttf',size)
def text(t,xy,size=36,bold=False,color=ink,anchor=None):d.text(xy,t,font=font(size,bold),fill=color,anchor=anchor)
text('보고서 제출까지의 소요시간 예상 비교',(1200,80),55,True,anchor='mm')
text('현장점검 완료 후 · 간단한 보고서 1건 · 시나리오 기반 추정',(1200,150),34,color=gray,anchor='mm')
colors=['#AEB8C2','#7A9AAA','#467FA2','#245A81']
start=490;scale=30;barh=135
for y,label,values,total in [(315,'복귀 후 작성',[20,10,15,5],50),(580,'앱으로 현장 작성',[0,2,3,5],10)]:
 text(label,(80,y+barh/2),39,True,anchor='lm')
 x=start
 for i,v in enumerate(values):
  if not v:continue
  w=v*scale
  d.rectangle((x,y,x+w,y+barh),fill=colors[i])
  if w>=130:text(f'{v}분',(x+w/2,y+barh/2),37,True,color='white' if i>=2 else ink,anchor='mm')
  x+=w
 text(f'예상 {total}분',(x+30,y+barh/2),43,True,color=blue,anchor='lm')
 if total==10:
  text('자료 정리 2분 + 생성 3분 + 검토·제출 5분',(start,y+barh+40),31,color=gray)
text('복귀 후 작성: 복귀 20분 + 자료 정리 10분 + 작성 15분 + 검토·제출 5분',(start,485),30,color=gray)
legend=[('제출 전 사무실 복귀',colors[0]),('사진·시설정보 정리',colors[1]),('보고서 작성·생성',colors[2]),('검토·제출',colors[3])]
for i,(label,c) in enumerate(legend):
 x=110+i*575
 d.rectangle((x,865,x+31,896),fill=c)
 text(label,(x+47,859),29)
d.line((85,945,2315,945),fill='#D9DFE4',width=2)
text('※ 실제 측정 결과가 아닌 시나리오 기반 추정치입니다.',(100,980),34,True)
text('사무실 복귀 20분과 간단한 보고서 1건을 가정하였습니다.',(100,1040),31,color=gray)
text('앱에서 현장 작성·검토 후 제출할 수 있는 상황을 가정하며, 제출 이후 복귀시간은 제외합니다.',(100,1095),31,color=gray)
text('실제 소요시간은 이동거리, 보고서 분량, 시스템 처리시간 및 검토 절차에 따라 달라질 수 있습니다.',(100,1150),31,color=gray)
out=root/'그림5_보고서제출시간_예상비교.png'
im.save(out,dpi=(359,359))
print(out)
