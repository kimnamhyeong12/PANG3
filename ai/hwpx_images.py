"""HWPX 그림 크기 보정 (D32).

python-hwpx 는 <hp:imgDim>/<hp:imgClip> 에 표시 크기(curSz)를 그대로 적는데, 한글은 이 값을
"원본 이미지 크기(픽셀 × 75 HWPUNIT)" 로 읽는다. 그래서 큰 사진은 왼쪽 위 일부만 잘려 확대돼 보인다.
저장한 .hwpx 를 열어 그림마다 실제 픽셀 크기로 imgDim·imgClip 을 다시 쓴다. 표시 크기(curSz)는 그대로.
"""
from __future__ import annotations

import io
import os
import re
import shutil
import tempfile
import zipfile

from PIL import Image

HWPUNIT_PER_PX = 75  # 96 dpi 기준: 1 inch = 7200 HWPUNIT

_PIC = re.compile(r"<hp:pic\b.*?</hp:pic>", re.S)
_REF = re.compile(r'binaryItemIDRef="([^"]+)"')
_ITEM = re.compile(r'<opf:item\b[^>]*\bid="([^"]+)"[^>]*\bhref="([^"]+)"')


def _image_sizes(z: zipfile.ZipFile) -> dict[str, tuple[int, int]]:
    hrefs = {}
    try:
        manifest = z.read("Contents/content.hpf").decode("utf-8")
        hrefs = {item_id: href for item_id, href in _ITEM.findall(manifest)}
    except KeyError:
        pass
    sizes = {}
    for name in z.namelist():
        if not name.startswith("BinData/"):
            continue
        stem = os.path.splitext(os.path.basename(name))[0]
        try:
            with Image.open(io.BytesIO(z.read(name))) as image:
                size = image.size
        except Exception:
            continue
        sizes[stem] = size
        for item_id, href in hrefs.items():
            if href == name:
                sizes[item_id] = size
    return sizes


def _fix_section(xml: str, sizes: dict[str, tuple[int, int]]) -> str:
    def fix(match: re.Match) -> str:
        pic = match.group(0)
        ref = _REF.search(pic)
        size = sizes.get(ref.group(1)) if ref else None
        if not size:
            return pic
        w, h = size[0] * HWPUNIT_PER_PX, size[1] * HWPUNIT_PER_PX
        pic = re.sub(r"<hp:imgClip\b[^>]*/>", f'<hp:imgClip left="0" right="{w}" top="0" bottom="{h}"/>', pic)
        return re.sub(r"<hp:imgDim\b[^>]*/>", f'<hp:imgDim dimwidth="{w}" dimheight="{h}"/>', pic)

    return _PIC.sub(fix, xml)


def fix_hwpx_images(path: str) -> None:
    """저장된 .hwpx 의 그림 원본 크기 정보를 고친다. 실패하면 원본을 그대로 둔다."""
    with zipfile.ZipFile(path) as z:
        sizes = _image_sizes(z)
        if not sizes:
            return
        entries = [(info, z.read(info.filename)) for info in z.infolist()]
    fd, tmp = tempfile.mkstemp(suffix=".hwpx", dir=os.path.dirname(os.path.abspath(path)))
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w") as out:
            for info, data in entries:
                if info.filename.startswith("Contents/section") and info.filename.endswith(".xml"):
                    data = _fix_section(data.decode("utf-8"), sizes).encode("utf-8")
                # mimetype 은 무압축으로 맨 앞에 (원본 순서·압축 방식 유지)
                out.writestr(info, data, compress_type=info.compress_type)
        shutil.move(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
