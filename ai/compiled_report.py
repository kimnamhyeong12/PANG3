"""
통합 보고서 HWPX 생성기 (프로젝트 통합 보고서용). 항목마다 4칸 사진표(작업 전·중·후·위치도)와 메모를 붙인다 (D36).
- 입력: REPORT_SCHEMA v1 JSON 파일 경로 (sys.argv[1]) + 백엔드가 덧붙인 값
    output_path              : 만들 HWPX 절대 경로
    sections[].items[].photo_files : [{"path": 로컬 파일, "slot": "작업 전", "comment": "...", "caption": "작업 전 ..."}]
    sections[].items[].map_file    : 위치도 이미지 로컬 경로 (없으면 null)
- 출력: 표준출력에 "@@AI_RESULT@@{json}" 한 줄 ({"ok": true, "report_file": ...})
"""

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

AI_DIR = Path(__file__).resolve().parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

# app.py 의 이미지 전처리를 그대로 재사용한다.
from app import RESULT_PREFIX, sanitize_image  # noqa: E402
from hwpx_images import fix_hwpx_images  # noqa: E402
from hwpx import HwpxDocument  # noqa: E402

FONT = "Malgun Gothic"
INK = "#111827"
HEAD = "#153B5C"
BODY = "#27384A"
SOFT = "#6B7280"
FULL_WIDTH = 45354
GROUP_BY_LABELS = {"adminDong": "행정동", "year": "연도", "author": "작성자", "category": "분류"}


def text(value, default="-") -> str:
    if value is None:
        return default
    value = str(value).strip()
    return value if value else default


def day(value) -> str:
    value = text(value, "")
    return value[:10] if value else "-"


def heading(doc, label: str) -> None:
    doc.add_paragraph().add_run(f"■ {label}", bold=True, size=12, color=HEAD, font=FONT)


def body_lines(doc, value: str, size: int = 10, color: str = BODY) -> None:
    for line in str(value).splitlines():
        line = line.strip()
        if line:
            doc.add_paragraph().add_run(line, size=size, color=color, font=FONT)


def key_value_table(doc, rows: list[tuple[str, str]]) -> None:
    table = doc.add_table(rows=len(rows), cols=2, width=FULL_WIDTH)
    table.set_column_widths([9000, FULL_WIDTH - 9000])
    for r, (label, value) in enumerate(rows):
        table.set_cell_shading(r, 0, "#F3F6FA")
        table.set_cell_text(r, 0, label)
        table.set_cell_text(r, 1, value)
    doc.add_paragraph()


def grid_table(doc, header: list[str], rows: list[list[str]], widths: list[int]) -> None:
    table = doc.add_table(rows=len(rows) + 1, cols=len(header), width=FULL_WIDTH)
    table.set_column_widths(widths)
    for c, label in enumerate(header):
        table.set_cell_shading(0, c, "#E8F2FF")
        table.set_cell_text(0, c, label)
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            table.set_cell_text(r, c, value)
    doc.add_paragraph()


def overview_map(doc, path: str, work_dir: Path, image_ext="webp") -> None:
    """서버가 만든 전체 위치도(번호 핀 = 항목 번호)를 본문 폭으로 넣는다."""
    target = str(work_dir / f"overview_map.{image_ext}")
    if not sanitize_image(path, target, canvas_size=(960, 560), fit_mode="contain"):  # 서버 위치도와 같은 크기(여백 없이)
        return
    heading(doc, "위치도")
    with open(target, "rb") as f:
        ref = doc.add_image(f.read(), image_ext)
    # 건별 양식(app.py)과 같이 표 칸 안에 넣어야 한글에서 자리가 흐트러지지 않는다
    table = doc.add_table(rows=1, cols=1, width=45354, height=25800)
    table.set_column_widths([45354])
    table.element.set("pageBreak", "TABLE")
    table.rows[0].cells[0].set_size(height=25800)
    table.rows[0].cells[0].paragraphs[0].add_picture(ref, width=43200, height=25200)
    doc.add_paragraph()


SLOTS = ("작업 전", "작업 중", "작업 후")
PHOTO_W, PHOTO_H = 20835, 14324  # 2칸 표 한 칸 (건별 보고서 사진 비율 1600:1100)


def photo_grid(doc, cells: list[dict]) -> None:
    """cells: [{"path": 정리된 이미지 또는 None, "label": "작업 전"}] — 2칸씩 한 줄, 사진 아래 이름 칸."""
    for i in range(0, len(cells), 2):
        chunk = cells[i:i + 2]
        table = doc.add_table(rows=2, cols=2, width=FULL_WIDTH)
        table.set_column_widths([22677, 22677])
        for c in range(2):
            cell = chunk[c] if c < len(chunk) else {"path": None, "label": ""}
            table.set_cell_shading(0, c, "#F8FAFC")
            table.rows[0].cells[c].set_size(height=PHOTO_H)
            if cell["path"]:
                with open(cell["path"], "rb") as f:
                    ref = doc.add_image(f.read(), Path(cell["path"]).suffix.lstrip("."))
                table.rows[0].cells[c].paragraphs[0].add_picture(ref, width=PHOTO_W, height=PHOTO_H)
            elif cell["label"]:
                table.set_cell_text(0, c, "사진 미등록")
            table.set_cell_shading(1, c, "#F3F6FA")
            table.rows[1].cells[c].set_size(height=1200)
            table.set_cell_text(1, c, cell["label"])
        doc.add_paragraph()


def append_item(doc, item: dict, number: int, work_dir: Path, image_ext="webp") -> None:
    """항목 하나: 제목 → 4칸(작업 전·중·후·위치도) → 메모(본문, 작업 전·중·후 설명) (D36)."""
    author = (item.get("author") or {}).get("name")
    title = item.get("title") or item.get("address")
    doc.add_paragraph().add_run(f"{number}. {text(title)}", bold=True, size=11, color=INK, font=FONT)
    meta = f"{text(item.get('address'))} · 완료일 {day(item.get('completedAt'))} · 작성자 {text(author)}"
    if item.get("adminDong"):
        meta += f" · {text(item.get('adminDong'))}"
    doc.add_paragraph().add_run(meta, size=9, color=SOFT, font=FONT)

    groups, extra = {slot: [] for slot in SLOTS}, []
    for idx, photo in enumerate(item.get("photo_files") or []):
        target = str(work_dir / f"p{number}_{idx}.{image_ext}")
        if not sanitize_image(photo.get("path"), target, canvas_size=(1600, 1100), fit_mode="contain"):
            continue
        entry = {"path": target, "comment": str(photo.get("comment") or "").strip()}
        (groups[photo["slot"]] if photo.get("slot") in groups else extra).append(entry)

    map_path = None
    if item.get("map_file"):
        target = str(work_dir / f"m{number}.{image_ext}")
        map_path = sanitize_image(item["map_file"], target, canvas_size=(1600, 1100), fit_mode="cover") and target

    # 단계마다 첫 사진이 4칸에 들어가고, 남는 사진은 아래에 2칸씩 이어 붙인다
    cells = [{"path": groups[slot][0]["path"] if groups[slot] else None, "label": slot} for slot in SLOTS]
    cells.append({"path": map_path, "label": "위치도"})
    more = [(slot, entry) for slot in SLOTS for entry in groups[slot][1:]] + [("현장사진", entry) for entry in extra]
    for k, (label, entry) in enumerate(more):
        cells.append({"path": entry["path"], "label": f"{label} ({k + 1})" if label == "현장사진" else label})
    photo_grid(doc, cells)

    memo = [line.strip() for line in str(item.get("comment") or "").splitlines() if line.strip()]
    for slot in SLOTS:
        memo += [f"{slot}: {entry['comment']}" for entry in groups[slot] if entry["comment"]]
    memo += [f"현장사진: {entry['comment']}" for entry in extra if entry["comment"]]
    memo = list(dict.fromkeys(memo))
    doc.add_paragraph().add_run("메모", bold=True, size=10, color=HEAD, font=FONT)
    body_lines(doc, "\n".join(memo) if memo else "-")
    doc.add_paragraph()


def build(payload: dict) -> str:
    output_path = payload.get("output_path")
    if not output_path:
        raise ValueError("output_path 가 필요합니다.")
    report = payload.get("report") or {}
    project = payload.get("project") or {}
    summary = payload.get("summary") or {}
    sections = payload.get("sections") or []

    out = Path(output_path)
    work_dir = out.parent / "_work" / uuid4().hex
    work_dir.mkdir(parents=True, exist_ok=True)
    image_ext = "jpg" if payload.get("image_format") == "jpg" else "webp"

    template = AI_DIR / "templates" / "template.hwpx"
    if template.exists():
        doc = HwpxDocument.open(str(template))
    else:
        doc = HwpxDocument.new()
        doc.set_page_margins(left=4819, right=4819, top=4535, bottom=4252)

    try:
        # 제목
        doc.add_paragraph().add_run(text(report.get("title"), "통합 보고서"), bold=True, size=16, color=INK, font=FONT)
        sub = " · ".join(v for v in [text(project.get("groupName"), ""), text(project.get("name"), "")] if v)
        status = "확정" if report.get("status") == "FINAL" else "초안"
        doc.add_paragraph().add_run(f"{sub} ({status} v{text(report.get('version'), '1')})", size=9, color=SOFT, font=FONT)
        doc.add_paragraph()

        # 개요
        period = summary.get("period") or {}
        group_by = report.get("groupBy") or "adminDong"
        heading(doc, "개요")
        key_value_table(doc, [
            ("프로젝트", text(project.get("name"))),
            ("사업 기간", f"{text(project.get('startDate'), '')} ~ {text(project.get('endDate'), '')}"),
            ("기간", f"{text(period.get('from'), '')} ~ {text(period.get('to'), '')}"),
            ("총 건수", f"{text(summary.get('totalCount'), '0')}건"),
            ("목차 구분", GROUP_BY_LABELS.get(group_by, group_by)),
            ("작성자", ", ".join(str(a) for a in (summary.get("authors") or [])) or "-"),
        ])

        if payload.get("overview_map_file"):
            overview_map(doc, payload["overview_map_file"], work_dir, image_ext)

        # 위치 목록 (번호는 섹션 순서를 따른다)
        heading(doc, "위치 목록")
        rows, number = [], 0
        for section in sections:
            for item in section.get("items") or []:
                number += 1
                rows.append([str(number), text(item.get("address")), text(section.get("label")), day(item.get("completedAt"))])
        if rows:
            grid_table(doc, ["번호", "위치", GROUP_BY_LABELS.get(group_by, "구분"), "완료일"], rows, [4000, 25354, 9000, 7000])
        else:
            body_lines(doc, "담긴 항목이 없습니다.", color=SOFT)
            doc.add_paragraph()

        # 섹션별 항목
        number = 0
        for section in sections:
            items = section.get("items") or []
            heading(doc, f"{text(section.get('label'))} ({len(items)}건)")
            for item in items:
                number += 1
                append_item(doc, item, number, work_dir, image_ext)

        doc.add_paragraph().add_run("위와 같이 보고합니다.", size=10, color=BODY, font=FONT)

        # app.py 와 같은 binItem id 보정 (한컴오피스 이미지 표시)
        header = doc._root.headers[0] if doc._root.headers else None
        if header is not None:
            for elem in header.element.iter():
                if elem.tag.endswith("binItem"):
                    bin_data = elem.get("BinData")
                    if bin_data:
                        elem.set("id", bin_data.split(".")[0])

        out.parent.mkdir(parents=True, exist_ok=True)
        doc.save_to_path(str(out))
        fix_hwpx_images(str(out))  # D32: 그림 원본 크기 보정
        return str(out.resolve())
    finally:
        for temp in work_dir.glob(f"*.{image_ext}"):
            try:
                temp.unlink()
            except OSError:
                pass
        try:
            work_dir.rmdir()
        except OSError:
            pass


def main() -> int:
    try:
        if len(sys.argv) <= 1:
            raise ValueError("입력 JSON 경로가 필요합니다.")
        arg = Path(sys.argv[1])
        if not arg.is_absolute():
            arg = AI_DIR / arg
        payload = json.loads(arg.read_text(encoding="utf-8"))
        if not os.path.isabs(str(payload.get("output_path") or "")):
            payload["output_path"] = str(AI_DIR / (payload.get("output_path") or f"output/compiled-{uuid4().hex}.hwpx"))
        result = {"ok": True, "report_file": build(payload), "error": None}
    except Exception as e:  # 백엔드는 ok/error 만 본다
        result = {"ok": False, "report_file": None, "error": str(e)}
    print(RESULT_PREFIX + json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
