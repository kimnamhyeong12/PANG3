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
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from hwpx import HwpxDocument


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
            canvas.save(target_path, "JPEG", quality=92)
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


def create_fieldwork_report(report_data: dict, output_filename: str) -> str:
    location_name = str(report_data.get("location_name") or "사하구 관내")
    task_category = str(report_data.get("task_category") or "현장 점검")
    main_comment = str(report_data.get("main_comment") or "")
    map_image = report_data.get("map_image_path")
    photo_groups = report_data.get("photo_groups") or []
    ai_refined = report_data.get("ai_refined_content") or ""

    # 1. 템플릿 로드
    template_path = Path(__file__).resolve().parent / "templates" / "template.hwpx"
    if template_path.exists():
        doc = HwpxDocument.open(str(template_path))
    else:
        doc = HwpxDocument.new()
        # 기본 여백 지정
        doc.set_page_margins(left=4819, right=4819, top=4535, bottom=4252)

    # 2. 제목 추가
    title_p = doc.add_paragraph()
    title_text = f"위치도 및 현장사진({location_name}, {task_category})"
    title_p.add_run(title_text, bold=True, size=15, color="#111827", font="Malgun Gothic")
    
    # 3. 작성일자 추가
    meta_p = doc.add_paragraph()
    meta_p.add_run(f"작성일자: {date.today().strftime('%Y-%m-%d')}", size=9, color="#6B7280", font="Malgun Gothic")
    
    # 공백 문단 추가
    doc.add_paragraph()

    # 4. 위치도 추가
    if map_image and os.path.exists(map_image):
        heading_p = doc.add_paragraph()
        heading_p.add_run("■ 위치도", bold=True, size=12, color="#153B5C", font="Malgun Gothic")
        
        with open(map_image, 'rb') as f:
            img_data = f.read()
        img_format = 'png' if map_image.lower().endswith('.png') else 'jpg'
        
        map_img_p = doc.add_paragraph()
        binary_item_id_ref = doc.add_image(img_data, img_format)
        map_img_p.add_picture(binary_item_id_ref, width=45921, height=25831)
        
        doc.add_paragraph()

    # 5. 사진 그룹 추가
    for group in photo_groups:
        section_title = group["section"]
        items = group["items"]
        
        heading_p = doc.add_paragraph()
        heading_p.add_run(f"■ {section_title}", bold=True, size=12, color="#153B5C", font="Malgun Gothic")
        
        for i in range(0, len(items), 2):
            chunk = items[i : i + 2]
            cols = len(chunk)
            
            # 테이블 너비를 전체 가용 가로폭인 45354로 고정 지정하여 찌그러짐 방지
            table = doc.add_table(rows=3, cols=cols, width=45354)
            
            # 열 가중치 및 개별 폭 지정
            if cols == 2:
                table.set_column_widths([22677, 22677])
            else:
                table.set_column_widths([45354])
            
            # 셀별 높이 지정 (사진 행은 크게, 텍스트 행은 작게 조정하여 찌그러짐 방지)
            h_photo = 14324 if cols == 2 else 29720
            h_text = 1200
            
            for col_idx, item in enumerate(chunk):
                # 1행: 사진 셀 설정
                table.set_cell_shading(0, col_idx, '#F8FAFC')
                table.rows[0].cells[col_idx].set_size(height=h_photo)
                cell_img_p = table.rows[0].cells[col_idx].paragraphs[0]
                
                img_path = item.get("sanitized_path") or item.get("path")
                if img_path and os.path.exists(img_path):
                    with open(img_path, 'rb') as f:
                        cell_img_data = f.read()
                    cell_img_format = 'png' if img_path.lower().endswith('.png') else 'jpg'
                    cell_bin_ref = doc.add_image(cell_img_data, cell_img_format)
                    
                    w_units = 20835 if cols == 2 else 43228
                    h_units = 14324 if cols == 2 else 29720
                    cell_img_p.add_picture(cell_bin_ref, width=w_units, height=h_units)
                else:
                    cell_img_p.add_run("[사진 없음]", size=10, color="#6B7280", font="Malgun Gothic")
                
                # 2행: 캡션 셀 설정
                table.set_cell_shading(1, col_idx, '#F3F6FA')
                table.rows[1].cells[col_idx].set_size(height=h_text)
                caption_text = item.get("caption") or ""
                table.set_cell_text(1, col_idx, caption_text)
                
            if cols == 2:
                table.merge_cells(2, 0, 2, 1)
            
            # 3행: 주요 의견 셀 설정
            table.set_cell_shading(2, 0, '#FFFFFF')
            table.rows[2].cells[0].set_size(height=h_text)
            comment_label = f"주요 의견: {main_comment}" if main_comment else "주요 의견: 없음"
            table.set_cell_text(2, 0, comment_label)
            
            doc.add_paragraph()

    # 6. 주요 의견 (단독 섹션)
    if main_comment:
        heading_p = doc.add_paragraph()
        heading_p.add_run("■ 주요 의견", bold=True, size=12, color="#153B5C", font="Malgun Gothic")
        
        mc_p = doc.add_paragraph()
        mc_p.add_run(main_comment, bold=True, size=11, color="#111827", font="Malgun Gothic")
        doc.add_paragraph()

    # 7. AI 현장 분석 의견 추가
    if ai_refined:
        heading_p = doc.add_paragraph()
        heading_p.add_run("■ AI 현장 분석 의견", bold=True, size=12, color="#153B5C", font="Malgun Gothic")
        
        cleaned_ai_refined = clean_markdown_for_hwp(ai_refined)
        for line in cleaned_ai_refined.splitlines():
            line_str = line.strip()
            if not line_str:
                continue
            body_p = doc.add_paragraph()
            body_p.add_run(line_str, size=10, color="#27384A", font="Malgun Gothic")
        
        doc.add_paragraph()

    # 8. 마침말 추가
    closing_p = doc.add_paragraph()
    closing_p.add_run("위와 같이 사하구 시설물 현장 점검 결과를 보고합니다.", size=10, color="#27384A", font="Malgun Gothic")

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
        canvas_size=(1920, 1080),
        fit_mode="cover",
    )

    sanitized_photos = []
    captions = []
    for idx, raw in enumerate(payload.get("field_photos") or []):
        src = raw.get("path") or raw.get("file")
        temp = str(work_dir / f"field_{idx}.jpg")
        sanitized = sanitize_image(src, temp, canvas_size=(1600, 1100), fit_mode="cover")
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
        f"위치도_및_현장사진_{safe_filename(location_name)}_{date.today():%Y%m%d}.hwpx"
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



def transcribe_audio(audio_path: str) -> dict:
    """Gemini를 이용해 짧은 현장 음성을 한국어 텍스트로 변환한다."""
    try:
        if not client:
            return {"ok": False, "text": None, "error": "GEMINI_API_KEY가 설정되지 않았습니다."}

        path = Path(audio_path)
        if not path.is_file():
            return {"ok": False, "text": None, "error": "음성 파일을 찾을 수 없습니다."}

        uploaded = client.files.upload(file=str(path))
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                uploaded,
                "이 음성을 한국어로 정확하게 받아쓰기 해주세요. 설명이나 따옴표 없이 말한 내용만 텍스트로 출력하세요.",
            ],
        )
        text = (response.text or "").strip()
        if not text:
            return {"ok": False, "text": None, "error": "인식된 음성이 없습니다."}
        return {"ok": True, "text": text, "error": None}
    except Exception as e:
        return {"ok": False, "text": None, "error": str(e)}

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
    if len(sys.argv) >= 3 and sys.argv[1] == "--stt":
        result = transcribe_audio(sys.argv[2])
        emit_result(result)
        sys.exit(0 if result.get("ok") else 1)

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
