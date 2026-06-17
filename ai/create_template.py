import os
from pathlib import Path
from hwpx import HwpxDocument

def main():
    # 저장할 디렉토리 생성
    templates_dir = Path(__file__).resolve().parent / "templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    
    template_path = templates_dir / "template.hwpx"
    
    # 새로운 HWPX 문서 생성
    doc = HwpxDocument.new()
    
    # 여백 설정 (한글 단위로 변환된 값)
    # 1mm = 283.46 HWP units
    # 좌우: 17mm -> 4819
    # 상: 16mm -> 4535
    # 하: 15mm -> 4252
    doc.set_page_margins(
        left=4819,
        right=4819,
        top=4535,
        bottom=4252,
        header=0,
        footer=0
    )
    
    # 기본 템플릿 저장
    doc.save_to_path(str(template_path))
    print(f"[Template Generator] 기본 템플릿 파일이 생성되었습니다: {template_path}")

if __name__ == "__main__":
    main()
