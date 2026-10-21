"""
사하구 현장 보고서 AI 엔진
- 입력: JSON (파일 또는 sys.argv[1])
- 출력: HWP 호환 docx + stdout 마지막 줄 @@AI_RESULT@@ JSON
"""

import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from google import genai
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from hwpx import HwpxDocument


register_heif_opener()

AI_DIR = Path(__file__).resolve().parent
load_dotenv(AI_DIR / ".env")

API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None

RESULT_PREFIX = "@@AI_RESULT@@"

# 보고서에 "AI 현장 분석 의견" 문단을 넣을지 여부.
# 사무 보고서에는 AI 요약/분석 텍스트 없이, 실제 입력한 사진·위치·의견만 들어가면 되므로 기본 False.
ENABLE_AI_ANALYSIS = False



import urllib.request
from urllib.parse import urlparse

def download_if_url(source_path: str | None, download_dir: Path) -> str | None:
    """
    들어온 경로가 S3 웹 주소(http/https) 형태이면 파일을 다운로드하고 로컬 경로를 반환합니다.
    원래 로컬 경로이거나 없으면 그대로 통과시킵니다.
    """
    if not source_path:
        return None
        
    # http:// 나 https:// 로 시작하는 웹 주소인지 검사
    parsed_url = urlparse(source_path)
    if parsed_url.scheme in ('http', 'https'):
        try:
            download_dir.mkdir(parents=True, exist_ok=True)
            # URL 주소 맨 뒤에서 실제 파일명(예: photo_0.jpg) 추출
            file_name = os.path.basename(parsed_url.path) or "downloaded_img.jpg"
            local_target_path = download_dir / file_name
            
            print(f"[S3 연동] 웹 이미지 감지됨. 다운로드 시작: {source_path}", file=sys.stderr)
            urllib.request.urlretrieve(source_path, str(local_target_path))
            print(f"[S3 연동] 다운로드 완료 -> {local_target_path}", file=sys.stderr)
            
            return str(local_target_path.resolve())
        except Exception as e:
            print(f"[S3 다운로드 에러] {source_path}: {e}", file=sys.stderr)
            return None
            
    return source_path


# ---------------------------------------------------------------------------
# 경로 · 입력 로드
# ---------------------------------------------------------------------------

def resolve_path(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_absolute():
        p = AI_DIR / p
    return str(p.resolve()) if p.exists() else None


def load_payload() -> dict:
    if len(sys.argv) <= 1:
        sample = AI_DIR / "samples" / "garak_sample.json"
        return json.loads(sample.read_text(encoding="utf-8"))
    arg = sys.argv[1]
    if arg.endswith(".json"):
        json_path = Path(arg)
        if not json_path.is_absolute():
            json_path = AI_DIR / json_path
        if json_path.is_file():
            return json.loads(json_path.read_text(encoding="utf-8"))
    return json.loads(arg)


# ---------------------------------------------------------------------------
# 이미지 전처리
# ---------------------------------------------------------------------------

def sanitize_image(
    source_path: str | None,
    target_path: str,
    canvas_size: tuple[int, int] = (1800, 1200),
    fit_mode: str = "cover",
) -> str | None:
    resolved = resolve_path(source_path) if source_path and not os.path.isabs(source_path) else source_path
    if resolved and not os.path.isabs(resolved):
        resolved = resolve_path(resolved)
    if not resolved or not os.path.exists(resolved):
        return None
    try:
        with Image.open(resolved) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            if fit_mode == "contain":
                canvas = Image.new("RGB", canvas_size, (255, 255, 255))
                img.thumbnail(canvas_size, Image.Resampling.LANCZOS)
                left = (canvas_size[0] - img.width) // 2
                top = (canvas_size[1] - img.height) // 2
                canvas.paste(img, (left, top))
            else:
                canvas = ImageOps.fit(
                    img,
                    canvas_size,
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
            # Compress the bytes embedded in HWPX, keeping its picture box unchanged.
            canvas.save(target_path, "JPEG", quality=80, optimize=True)
        return target_path
    except Exception as e:
        print(f"[Image Sanitizer Error] {source_path}: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# 사진 코멘트 파싱 · 섹션 그룹
# ---------------------------------------------------------------------------

def normalize_section(section: str) -> str:
    section = section.strip()
    m = re.match(r"^현장사진\s*\(\s*(\d+)\s*\)$", section, re.IGNORECASE)
    if m:
        return f"현장사진 ({m.group(1)})"
    m = re.match(r"^현장사진\s*\(\s*(\d+)\s*\)", section, re.IGNORECASE)
    if m:
        return f"현장사진 ({m.group(1)})"
    if section in ("전", "중", "후"):
        return f"현장사진 ({section})"
    return section


def parse_photo_comment(text: str, auto_index: int) -> tuple[str, str]:
    text = (text or "").strip()
    if not text:
        return f"__auto_{auto_index}__", ""

    if "|" in text:
        section, caption = text.split("|", 1)
        return normalize_section(section.strip()), caption.strip()

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if len(lines) >= 2:
        return normalize_section(lines[0]), "\n".join(lines[1:])

    if text in ("전", "중", "후"):
        return f"현장사진 ({text})", ""

    m = re.match(r"^현장사진\s*\(\s*(\d+)\s*\)\s*$", text, re.IGNORECASE)
    if m:
        return f"현장사진 ({m.group(1)})", ""

    m = re.match(r"^현장사진\s*\(\s*(\d+)\s*\)\s*(.+)$", text, re.IGNORECASE | re.DOTALL)
    if m:
        return f"현장사진 ({m.group(1)})", m.group(2).strip()

    return f"__auto_{auto_index}__", text


def group_field_photos(field_photos: list) -> list[dict]:
    groups: list[dict] = []
    index: dict[str, int] = {}
    auto_counter = 1

    for raw in field_photos or []:
        path = raw.get("path") or raw.get("file")
        comment = raw.get("comment", "")
        section, caption = parse_photo_comment(comment, auto_counter)
        if section.startswith("__auto_"):
            section = f"현장사진 ({auto_counter})"
            auto_counter += 1

        if section not in index:
            index[section] = len(groups)
            groups.append({"section": section, "items": []})
        groups[index[section]]["items"].append({"path": path, "caption": caption})

    return groups


# ---------------------------------------------------------------------------
# HWP 호환 docx 보고서 생성
# ---------------------------------------------------------------------------

def clean_markdown_for_hwp(text: str) -> str:
    if not text:
        return ""
    cleaned = []
    for line in text.split("\n"):
        line = line.strip().replace("**", "")
        line = re.sub(r"^#{1,6}\s*", "", line)
        line = re.sub(r"^\*\s+", "- ", line)
        if line.startswith("## "):
            line = line.replace("## ", "■ ")
        elif line.startswith("### "):
            line = line.replace("### ", "  ○ ")
        elif line.startswith("* "):
            line = line.replace("* ", "  - ")
        cleaned.append(line)
    return "\n".join(cleaned)


def create_fieldwork_report(report_data: dict, output_filename: str, document=None) -> str:
    location_name = str(report_data.get("location_name") or "사하구 관내")
    task_category = str(report_data.get("task_category") or "현장 점검")
    main_comment = str(report_data.get("main_comment") or "")
    map_image = report_data.get("map_image_path")
    photo_groups = report_data.get("photo_groups") or []
    ai_refined = report_data.get("ai_refined_content") or ""

    # 1. 템플릿 로드
    template_path = Path(__file__).resolve().parent / "templates" / "template.hwpx"
    if document is not None:
        doc = document
        doc.add_paragraph()
    elif template_path.exists():
        doc = HwpxDocument.open(str(template_path))
    else:
        doc = HwpxDocument.new()
        # 기본 여백 지정
        doc.set_page_margins(left=4819, right=4819, top=4535, bottom=4252)

    # One full-width bordered section per field, matching the printed report form.
    width = 45354
    image_width = 43200
    heading_height = 1500
    font = "Malgun Gothic"

    def section_table(label, body_height, *, split=False):
        table = doc.add_table(rows=2, cols=1, width=width,
                              height=heading_height + body_height)
        table.set_column_widths([width])
        # Keep a photo and its heading together; long text may continue on another page.
        table.element.set("pageBreak", "CELL" if split else "TABLE")
        table.rows[0].cells[0].set_size(height=heading_height)
        table.rows[1].cells[0].set_size(height=body_height)
        table.set_cell_shading(0, 0, "#EEF2F6")
        table.rows[0].cells[0].paragraphs[0].add_run(
            label, bold=True, size=11, color="#153B5C", font=font)
        return table

    def put_image(cell, image_path, image_height, empty_text):
        paragraph = cell.paragraphs[0]
        if image_path and os.path.isfile(image_path):
            with open(image_path, "rb") as source:
                image_ref = doc.add_image(source.read(), "png" if str(image_path).lower().endswith(".png") else "jpg")
            paragraph.add_picture(image_ref, width=image_width, height=image_height)
        else:
            paragraph.add_run(empty_text, size=10, color="#6B7280", font=font)

    def text_section(label, text):
        table = section_table(label, 2400, split=True)
        cell = table.rows[1].cells[0]
        lines = str(text or "미입력").splitlines() or ["미입력"]
        for index, line in enumerate(lines):
            paragraph = cell.paragraphs[0] if index == 0 else cell.add_paragraph()
            paragraph.add_run(line, size=10, color="#27384A", font=font)
        doc.add_paragraph()

    doc.add_paragraph().add_run("위치도 및 현장사진", bold=True, size=16, color="#111827", font=font)
    report_name = re.sub(r"^현장\s*보고서\s*[-–—]\s*", "", str(report_data.get("report_name") or "")).strip()
    status_key = report_data.get("progress_status")
    status = {"pending": "작업 전", "working": "작업 중", "complete": "작업 후"}.get(status_key, "")
    from datetime import datetime, timedelta, timezone
    completed_text = "작성 시각 미기록"
    # In-progress reports use their saved creation time, never the download time.
    for timestamp in (report_data.get("completed_at"), report_data.get("recorded_at")):
        timestamp = str(timestamp or "").strip()
        if not timestamp:
            continue
        try:
            completed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if completed.tzinfo is not None:
                completed = completed.astimezone(timezone(timedelta(hours=9)))
            completed_text = completed.strftime("%Y-%m-%d" if len(timestamp) == 10 else "%Y-%m-%d %H:%M:%S")
            break
        except ValueError:
            continue
    recorded_at = str(report_data.get("recorded_at") or "미기록")[:10]
    metadata = doc.add_table(rows=3, cols=2, width=width, height=6600)
    metadata.set_column_widths([11000, width - 11000])
    for row, (label, value) in enumerate([
        ("작업 처리 일자·시간", completed_text),
        ("보고서명", report_name or location_name),
        ("작성일자", recorded_at + (f" · {status}" if status else "")),
    ]):
        metadata.set_cell_shading(row, 0, "#EEF2F6")
        for column, text in enumerate([label, value]):
            metadata.rows[row].cells[column].set_size(height=2200)
            metadata.rows[row].cells[column].paragraphs[0].add_run(
                text, bold=column == 0, size=10, color="#27384A", font=font)
    doc.add_paragraph()

    # Address and map share one bordered block. The map never uses a visit/photo name as an address.
    has_map = bool(map_image and os.path.isfile(map_image))
    map_body_height = 24900 if has_map else 6400
    location_table = doc.add_table(rows=3, cols=1, width=width,
                                   height=heading_height + 2000 + map_body_height)
    location_table.set_column_widths([width])
    location_table.element.set("pageBreak", "TABLE")
    location_table.set_cell_shading(0, 0, "#EEF2F6")
    for row, height in enumerate([heading_height, 2000, map_body_height]):
        location_table.rows[row].cells[0].set_size(height=height)
    location_table.rows[0].cells[0].paragraphs[0].add_run("위치도", bold=True, size=11, color="#153B5C", font=font)
    location_table.rows[1].cells[0].paragraphs[0].add_run(f"작업 위치: {location_name}", size=10, color="#27384A", font=font)
    put_image(location_table.rows[2].cells[0], map_image, 24300, "위치도 미등록")
    doc.add_paragraph()

    stages = [("작업 전", []), ("작업 중", []), ("작업 후", [])]
    stage_aliases = {
        "작업 전": 0, "현장사진 (전)": 0, "before": 0,
        "작업 중": 1, "현장사진 (중)": 1, "during": 1,
        "작업 후": 2, "현장사진 (후)": 2, "after": 2,
    }
    extras = []
    opinions = [str(report_data.get("field_memo") or "").strip(), main_comment.strip()]
    for group in photo_groups:
        stage = stage_aliases.get(group["section"])
        for item in group["items"]:
            if stage is None:
                extras.append((group["section"], [item]))
            else:
                stages[stage][1].append(item)
            caption = str(item.get("caption") or "").strip()
            if caption:
                opinions.append(f"{group['section']}: {caption}")

    # Separate one-column tables prevent the three stages from appearing side by side.
    for label, images in stages + extras:
        for index, item in enumerate(images or [None]):
            heading = label + (f" ({index + 1}/{len(images)})" if len(images) > 1 else "")
            image_path = (item.get("sanitized_path") or item.get("path")) if item else None
            has_image = bool(image_path and os.path.isfile(image_path))
            table = section_table(heading, 30300 if has_image else 6400)
            put_image(table.rows[1].cells[0], image_path, 29700, "사진 미등록")
            doc.add_paragraph()

    overall_comment = "\n".join(dict.fromkeys(value for value in opinions if value))
    text_section("메모", overall_comment)
    if ai_refined:
        text_section("AI 현장 분석 의견", clean_markdown_for_hwp(ai_refined))

    # 9. 파일 저장 및 바이너리 매핑 오류 보정
    # Hancom Office에서 이미지가 정상적으로 표시되도록 binItem id와 binaryItemIDRef를 매칭시킴 (라이브러리 버그 보완)
    header = doc._root.headers[0] if doc._root.headers else None
    if header is not None:
        for elem in header.element.iter():
            if elem.tag.endswith("binItem"):
                bin_data_val = elem.get("BinData")
                if bin_data_val:
                    name_without_ext = bin_data_val.split(".")[0]
                    elem.set("id", name_without_ext)

    out_path = Path(output_filename)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save_to_path(str(out_path))
    return str(out_path.resolve())


# ---------------------------------------------------------------------------
# Gemini 분석 Core
# ---------------------------------------------------------------------------

def run_gemini_analysis(
    image_path: str | None,
    location_name: str,
    field_memo: str,
    main_comment: str,
    photo_captions: list[str],
) -> str:
    if not client:
        return "GEMINI_API_KEY가 설정되지 않았습니다. ai/.env 파일을 확인하세요."

    if not image_path or not os.path.exists(image_path):
        return "분석할 현장 사진이 없습니다."

    captions_text = "\n".join(f"- {c}" for c in photo_captions if c) or "(없음)"
    prompt = f"""
당신은 부산광역시 사하구청의 현장 조사 전문 공무원입니다.
'{location_name}' 현장 사진과 담당자 메모를 바탕으로
공식 행정 보고서에 넣을 '현장 상황 요약 및 조치 의견'을 작성하세요.

[작성 원칙]
1. 공문서체 (~함, ~임, ~요망)만 사용할 것.
2. 사진에서 보이는 상세 피해 상태 및 위험도를 행정 공무원 관점으로 기술할 것.
3. 기입된 현장 메모와 메인 코멘트 요구사항을 공문서 단어로 각색하여 누락 없이 반영할 것.

[현장 메모]: {field_memo or "(없음)"}
[메인 코멘트]: {main_comment or "(없음)"}
[사진별 설명]:
{captions_text}

[공식 보고서 내용]:
"""
    try:
        image_object = Image.open(image_path)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[image_object, prompt],
        )
        return (response.text or "").strip()
    except Exception as e:
        return f"GenAI API 오류: {e}"


# ---------------------------------------------------------------------------
# 파이프라인 가동
# ---------------------------------------------------------------------------

def safe_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "_", name).strip() or "report"


def run_pipeline(payload: dict, document=None, combined_path=None) -> dict:
    if "reports" in payload:
        reports = payload["reports"]
        if not isinstance(reports, list) or not reports:
            raise ValueError("보고서가 필요합니다.")
        output_dir = Path(payload.get("output_dir") or AI_DIR / "output")
        if not output_dir.is_absolute():
            output_dir = AI_DIR / output_dir
        batch_path = str(output_dir / f"외근_통합보고서_{date.today():%Y%m%d}_{uuid4().hex}.hwpx")
        template = AI_DIR / "templates" / "template.hwpx"
        doc = HwpxDocument.open(str(template)) if template.exists() else HwpxDocument.new()
        for report in reports:
            run_pipeline({**report, "output_dir": str(output_dir)}, document=doc, combined_path=batch_path)
        return {"ok": True, "report_file": batch_path, "report_count": len(reports)}
    location_name = payload.get("location_name") or "사하구"
    task_category = payload.get("task_category") or "현장 점검"
    field_memo = payload.get("field_memo") or ""
    main_comment = payload.get("main_comment") or ""

    output_dir = payload.get("output_dir") or "output"
    if not Path(output_dir).is_absolute():
        output_dir = AI_DIR / output_dir
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    work_dir = output_dir / "_work" / uuid4().hex
    work_dir.mkdir(parents=True, exist_ok=True)

    map_sanitized = sanitize_image(
        payload.get("map_image"),
        str(work_dir / "map.jpg"),
        canvas_size=(1920, 1080),
        # 흰 여백 없이 박스를 꽉 채우도록 cover로 (모서리가 살짝 잘릴 수 있음)
        fit_mode="cover",
    )

    sanitized_photos = []
    captions = []
    for idx, raw in enumerate(payload.get("field_photos") or []):
        src = raw.get("path") or raw.get("file")
        temp = str(work_dir / f"field_{idx}.jpg")
        # Preserve the entire field photo inside its report cell.
        sanitized = sanitize_image(src, temp, canvas_size=(1600, 1100), fit_mode="contain")
        _, caption = parse_photo_comment(raw.get("comment", ""), idx + 1)
        captions.append(caption)
        sanitized_photos.append(
            {
                "path": resolve_path(src),
                "sanitized_path": sanitized,
                "comment": raw.get("comment", ""),
                "caption": caption,
            }
        )

    groups = []
    section_index: dict[str, int] = {}
    auto_counter = 1
    for p in sanitized_photos:
        section, caption = parse_photo_comment(p["comment"], auto_counter)
        if section.startswith("__auto_"):
            section = f"현장사진 ({auto_counter})"
            auto_counter += 1
        if section not in section_index:
            section_index[section] = len(groups)
            groups.append({"section": section, "items": []})
        groups[section_index[section]]["items"].append(
            {
                "sanitized_path": p["sanitized_path"],
                "caption": caption,
            }
        )

    primary_image = next(
        (p["sanitized_path"] for p in sanitized_photos if p["sanitized_path"]),
        map_sanitized,
    )

    if ENABLE_AI_ANALYSIS:
        print("[Engine] Gemini 분석 시작...", file=sys.stderr)
        ai_refined_content = run_gemini_analysis(
            primary_image,
            location_name,
            field_memo,
            main_comment,
            captions,
        )
    else:
        ai_refined_content = ""

    report_name = (
        f"위치도_및_현장사진_{safe_filename(location_name)}_{payload.get('progress_id', 'new')}_{uuid4().hex}.hwpx"
    )
    report_path = create_fieldwork_report(
        {
            "location_name": location_name,
            "report_name": payload.get("report_name"),
            "completed_at": payload.get("completed_at"),
            "task_category": task_category,
            "main_comment": main_comment,
            "field_memo": field_memo,
            "recorded_at": payload.get("recorded_at"),
            "progress_status": payload.get("progress_status"),
            "map_image_path": map_sanitized,
            "photo_groups": groups,
            "ai_refined_content": ai_refined_content,
        },
        combined_path or str(output_dir / report_name),
        document=document,
    )

    for temp in work_dir.glob("*.jpg"):
        try:
            temp.unlink()
        except OSError:
            pass
    try:
        work_dir.rmdir()
    except OSError:
        pass

    return {
        "ok": True,
        "location_name": location_name,
        "task_category": task_category,
        "main_comment": main_comment,
        "field_memo": field_memo,
        "ai_refined_content": ai_refined_content,
        "report_file": report_path,
        "error": None,
    }



def emit_result(result: dict) -> None:
    line = RESULT_PREFIX + json.dumps(result, ensure_ascii=False)
    print(line)


def run_pipeline_safe(payload: dict) -> dict:
    try:
        return run_pipeline(payload)
    except Exception as e:
        return {
            "ok": False,
            "ai_refined_content": None,
            "report_file": None,
            "error": str(e),
        }


# ---------------------------------------------------------------------------
# CLI 진입
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 57, file=sys.stderr)
    print(" Saha-gu AI Report Engine", file=sys.stderr)
    print("=" * 57, file=sys.stderr)

    payload = load_payload()
    result = run_pipeline_safe(payload)

    if result.get("ok"):
        print(f"\n[완료] 보고서: {result.get('report_file')}", file=sys.stderr)
        print(f"[AI 본문]\n{result.get('ai_refined_content')}", file=sys.stderr)
    else:
        print(f"\n[실패] {result.get('error')}", file=sys.stderr)

    emit_result(result)
    sys.exit(0 if result.get("ok") else 1)
