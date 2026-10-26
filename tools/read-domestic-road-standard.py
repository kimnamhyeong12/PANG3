"""Read the relevant complete pages of the official public node/link standard."""
from pathlib import Path
import json
from pypdf import PdfReader

root=Path(__file__).resolve().parents[1];out=root/'tmp/domestic-road-comparison'
reader=PdfReader(out/'its-criteria-pdf.pdf');pages=[];all_text=[]
for number,page in enumerate(reader.pages,1):
    text=page.extract_text();all_text.append(text)
    if any(word in text for word in ['ROAD_USE','TURN_OPER','REST_VEH']):
        pages.append(number);(out/f'standard-page-{number}.txt').write_text(text,encoding='utf-8')
        print('SAVED_RELEVANT_PAGE '+str(number),flush=True)
(out/'standard-pages.json').write_text(json.dumps(pages))
(out/'its-criteria.txt').write_text('\n'.join(all_text),encoding='utf-8')
