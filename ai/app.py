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

from dotenv import load_dotenv
from google import genai
from PIL import Image
from pillow_heif import register_heif_opener
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt


register_heif_opener()

AI_DIR = Path(__file__).resolve().parent
load_dotenv(AI_DIR / ".env")

API_KEY = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None

RESULT_PREFIX = "@@AI_RESULT@@"



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

def sanitize_image(source_path: str | None, target_path: str) -> str | None:
    resolved = resolve_path(source_path) if source_path and not os.path.isabs(source_path) else source_path
    if resolved and not os.path.isabs(resolved):
        resolved = resolve_path(resolved)
    if not resolved or not os.path.exists(resolved):
        return None
    try:
        with Image.open(resolved) as img:
            img.convert("RGB").save(target_path, "JPEG", quality=90)
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
        if line.startswith("## "):
            line = line.replace("## ", "■ ")
        elif line.startswith("### "):
            line = line.replace("### ", "  ○ ")
        elif line.startswith("* "):
            line = line.replace("* ", "  - ")
        cleaned.append(line)
    return "\n".join(cleaned)


def _add_caption_cell(cell, caption: str) -> None:
    if caption:
        cap_p = cell.add_paragraph(caption)
        cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        if cap_p.runs:
            cap_p.runs[0].font.size = Pt(9)


def _add_photo_to_cell(cell, img_path: str | None, width_in: float = 2.8) -> None:
    if img_path and os.path.exists(img_path):
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run()
        run.add_picture(img_path, width=Inches(width_in))
    else:
        cell.text = "\n[사진 없음]\n"
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER


def create_fieldwork_report(report_data: dict, output_filename: str) -> str:
    location_name = str(report_data.get("location_name") or "사하구 관내")
    task_category = str(report_data.get("task_category") or "현장 점검")
    main_comment = str(report_data.get("main_comment") or "")
    map_image = report_data.get("map_image_path")
    photo_groups = report_data.get("photo_groups") or []
    ai_refined = report_data.get("ai_refined_content") or ""

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Malgun Gothic"
    style.font.size = Pt(11)

    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_p.add_run(
        f"위치도 및 현장사진({location_name}, {task_category})"
    )
    title_run.font.size = Pt(16)
    title_run.bold = True
    doc.add_paragraph()

    if map_image and os.path.exists(map_image):
        map_p = doc.add_paragraph()
        map_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        map_p.add_run().add_picture(map_image, width=Inches(6.0))
        doc.add_paragraph()

    for group in photo_groups:
        section_title = group["section"]
        items = group["items"]

        header_p = doc.add_paragraph()
        header_run = header_p.add_run(section_title)
        header_run.bold = True
        header_run.font.size = Pt(12)

        for i in range(0, len(items), 2):
            chunk = items[i : i + 2]
            cols = len(chunk)
            table = doc.add_table(rows=2, cols=cols)
            table.style = "Table Grid"

            for col_idx, item in enumerate(chunk):
                img_cell = table.cell(0, col_idx)
                _add_photo_to_cell(
                    img_cell,
                    item.get("sanitized_path") or item.get("path"),
                    width_in=2.6 if cols == 2 else 5.0,
                )
                cap_cell = table.cell(1, col_idx)
                cap_cell.text = ""
                _add_caption_cell(cap_cell, item.get("caption") or "")

            doc.add_paragraph()

    if main_comment:
        mc_p = doc.add_paragraph()
        mc_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        mc_run = mc_p.add_run(main_comment)
        mc_run.bold = True
        mc_run.font.size = Pt(12)
        doc.add_paragraph()

    if ai_refined:
        ai_p = doc.add_paragraph()
        ai_run = ai_p.add_run("■ AI 현장 분석 의견")
        ai_run.bold = True
        doc.add_paragraph(clean_markdown_for_hwp(ai_refined))

    doc.add_paragraph(
        f"작성일자: {date.today().strftime('%Y-%m-%d')}"
    ).alignment = WD_ALIGN_PARAGRAPH.RIGHT
    doc.add_paragraph(
        "위와 같이 사하구 시설물 현장 점검 결과를 보고합니다."
    ).alignment = WD_ALIGN_PARAGRAPH.CENTER

    out_path = Path(output_filename)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_path))
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


def run_pipeline(payload: dict) -> dict:
    location_name = payload.get("location_name") or "사하구"
    task_category = payload.get("task_category") or "현장 점검"
    field_memo = payload.get("field_memo") or ""
    main_comment = payload.get("main_comment") or ""

    output_dir = payload.get("output_dir") or "output"
    if not Path(output_dir).is_absolute():
        output_dir = AI_DIR / output_dir
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    work_dir = output_dir / "_work"
    work_dir.mkdir(parents=True, exist_ok=True)

    map_sanitized = sanitize_image(
        payload.get("map_image"),
        str(work_dir / "map.jpg"),
    )

    sanitized_photos = []
    captions = []
    for idx, raw in enumerate(payload.get("field_photos") or []):
        src = raw.get("path") or raw.get("file")
        temp = str(work_dir / f"field_{idx}.jpg")
        sanitized = sanitize_image(src, temp)
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

    print("[Engine] Gemini 분석 시작...", file=sys.stderr)
    ai_refined_content = run_gemini_analysis(
        primary_image,
        location_name,
        field_memo,
        main_comment,
        captions,
    )

    report_name = (
        f"위치도_및_현장사진_{safe_filename(location_name)}_{date.today():%Y%m%d}.hwp"
    )
    report_path = create_fieldwork_report(
        {
            "location_name": location_name,
            "task_category": task_category,
            "main_comment": main_comment,
            "map_image_path": map_sanitized,
            "photo_groups": groups,
            "ai_refined_content": ai_refined_content,
        },
        str(output_dir / report_name),
    )

    for temp in work_dir.glob("*.jpg"):
        try:
            temp.unlink()
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