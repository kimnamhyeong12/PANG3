"""
통합 보고서 HWPX 생성기 (프로젝트 통합 보고서용, 기존 app.py 동작과 무관).
- 입력: REPORT_SCHEMA v1 JSON 파일 경로 (sys.argv[1]) + 백엔드가 덧붙인 값
    output_path              : 만들 HWPX 절대 경로
    sections[].items[].photo_files : [{"path": 로컬 파일, "caption": "작업 전 ..."}]
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

# 기존 app.py 의 이미지 전처리·문구 정리 함수를 그대로 재사용한다 (app.py 는 수정하지 않음).
from app import RESULT_PREFIX, clean_markdown_for_hwp, sanitize_image  # noqa: E402
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


def picture_table(doc, pictures: list[dict]) -> None:
    """pictures: [{"path": sanitized jpg, "caption": str}] — 2장씩 한 줄 (app.py 와 같은 크기)."""
    for i in range(0, len(pictures), 2):
        chunk = pictures[i:i + 2]
        cols = len(chunk)
        table = doc.add_table(rows=2, cols=cols, width=FULL_WIDTH)
        table.set_column_widths([22677, 22677] if cols == 2 else [FULL_WIDTH])
        h_photo = 14324 if cols == 2 else 29720
        w_photo = 20835 if cols == 2 else 43228
        for c, pic in enumerate(chunk):
            table.set_cell_shading(0, c, "#F8FAFC")
            table.rows[0].cells[c].set_size(height=h_photo)
            with open(pic["path"], "rb") as f:
                ref = doc.add_image(f.read(), "jpg")
            table.rows[0].cells[c].paragraphs[0].add_picture(ref, width=w_photo, height=h_photo)
            table.set_cell_shading(1, c, "#F3F6FA")
            table.rows[1].cells[c].set_size(height=1200)
            table.set_cell_text(1, c, pic.get("caption") or "")
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
            ("분류 기준", GROUP_BY_LABELS.get(group_by, group_by)),
            ("작성자", ", ".join(str(a) for a in (summary.get("authors") or [])) or "-"),
        ])

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
                author = (item.get("author") or {}).get("name")
                title = item.get("title") or item.get("address")
                doc.add_paragraph().add_run(f"{number}. {text(title)}", bold=True, size=11, color=INK, font=FONT)
                meta = f"{text(item.get('address'))} · 완료일 {day(item.get('completedAt'))} · 작성자 {text(author)}"
                if item.get("category"):
                    meta += f" · {text(item.get('category'))}"
                doc.add_paragraph().add_run(meta, size=9, color=SOFT, font=FONT)
                doc.add_paragraph().add_run("작업 내용", bold=True, size=10, color=HEAD, font=FONT)
                body_lines(doc, text(item.get("comment")))
                ai = item.get("aiRefinedContent")
                if ai and str(ai).strip():
                    doc.add_paragraph().add_run("AI 정리", bold=True, size=10, color=HEAD, font=FONT)
                    body_lines(doc, clean_markdown_for_hwp(str(ai)))

                pictures = []
                for idx, photo in enumerate(item.get("photo_files") or []):
                    target = str(work_dir / f"p{number}_{idx}.jpg")
                    if sanitize_image(photo.get("path"), target, canvas_size=(1600, 1100), fit_mode="cover"):
                        pictures.append({"path": target, "caption": photo.get("caption") or ""})
                map_file = item.get("map_file")
                if map_file:
                    target = str(work_dir / f"m{number}.jpg")
                    if sanitize_image(map_file, target, canvas_size=(1600, 1100), fit_mode="cover"):
                        pictures.append({"path": target, "caption": "위치도"})
                if pictures:
                    picture_table(doc, pictures)
                else:
                    doc.add_paragraph()

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
        return str(out.resolve())
    finally:
        for temp in work_dir.glob("*.jpg"):
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
