"""Synthetic HWPX export checks; never loads .env or calls the AI/network client."""
import ast
import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile
from xml.etree import ElementTree as ET

from PIL import Image, ImageOps
from hwpx import HwpxDocument

AI_DIR = Path(__file__).resolve().parent
ENABLE_AI_ANALYSIS = False
source = ast.parse((AI_DIR / 'app.py').read_text(encoding='utf-8'))
names = {'resolve_path', 'sanitize_image', 'normalize_section', 'parse_photo_comment',
         'clean_markdown_for_hwp', 'create_fieldwork_report', 'safe_filename', 'run_pipeline'}
functions = ast.Module(body=[node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
exec(compile(functions, str(AI_DIR / 'app.py'), 'exec'), globals())

def main():
    output = AI_DIR.parent / 'backend' / 'target' / 'ux-export-test'
    output.mkdir(parents=True, exist_ok=True)
    red = output / 'red.jpg'
    blue = output / 'blue.jpg'
    Image.new('RGB', (200, 160), 'red').save(red)
    Image.new('RGB', (200, 160), 'blue').save(blue)
    reports = [
        {'location_name': '검증 A현장', 'recorded_at': '2026-10-12', 'progress_status': 'working',
         'field_memo': '첫날의 메모', 'field_photos': [{'path': str(red), 'comment': '작업 중|첫날 사진'}]},
        {'location_name': '검증 B현장', 'recorded_at': '2026-10-13', 'progress_status': 'complete',
         'report_name': '수정한 보고서 이름', 'completed_at': '2026-10-13T14:35:23',
         'field_memo': '둘째날의 메모', 'field_photos': [{'path': str(blue), 'comment': '작업 후|둘째날 사진'}]},
    ]
    result = run_pipeline({'reports': reports, 'output_dir': str(output)})
    assert result['ok'] and result['report_count'] == 2
    with ZipFile(result['report_file']) as package:
        assert package.testzip() is None
        documents = [ET.fromstring(package.read(name)) for name in package.namelist() if name.startswith('Contents/') and name.endswith('.xml')]
        text = ' '.join(''.join(node.itertext()) for node in documents)
        for value in ['검증 A현장', '검증 B현장', '첫날의 메모', '둘째날의 메모', '첫날 사진', '둘째날 사진', '2026-10-12', '2026-10-13', '작업 중', '작업 후']:
            assert value in text, value
        assert '수정한 보고서 이름' in text
        assert '작업 처리 일자·시간' in text
        assert '2026-10-13 14:35:23' in text
        images = [name for name in package.namelist() if name.startswith('BinData/')]
        assert len(images) >= 2, images
        assert len({package.read(name) for name in images}) >= 2, 'Two visits must not share an overwritten image'
        binary_ids = {element.get('id') for doc in documents for element in doc.iter() if element.tag.endswith('binItem')}
        refs = {element.get('binaryItemIDRef') for doc in documents for element in doc.iter() if element.get('binaryItemIDRef')}
        assert refs and refs <= binary_ids, (refs, binary_ids)
    one = run_pipeline({**reports[0], 'output_dir': str(output)})
    two = run_pipeline({**reports[0], 'output_dir': str(output)})
    assert one['report_file'] != two['report_file']
    print('HWPX export checks passed: two visits, photos, stages, original dates, memos and unique files')

if __name__ == '__main__':
    main()
