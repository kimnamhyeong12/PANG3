import os
from google import genai
from PIL import Image
from pillow_heif import register_heif_opener
from dotenv import load_dotenv


# 1. Register HEIF opener for iOS compatibility
register_heif_opener()

load_dotenv()

# 2. Initialize Google GenAI Client
# 💡 BEST PRACTICE: 구글 공식 가이드에 따라 API 키는 환경 변수(GEMINI_API_KEY)로 읽거나, 
# 임시로 문자열을 넣되 절대 실제 키를 깃허브에 푸시하지 마세요.
API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyDIsYKIUMoXO0DPbZOcqcoiCpwljcwBYNY")
client = genai.Client(api_key=API_KEY)

def sanitize_image(source_path, target_path="temp_processed.jpg"):
    """
    Converts multi-layer images (HEIC, Samsung MPO) into standard single-layer JPEG
    to prevent 400 Bad Request errors on Gemini API.
    """
    if not source_path or not os.path.exists(source_path):
        return None
    try:
        with Image.open(source_path) as img:
            img.convert('RGB').save(target_path, 'JPEG', quality=90)
        return target_path
    except Exception as e:
        print(f"🚨 [Image Sanitizer Error] Failed to process {source_path}: {e}")
        return None

def generate_sahagu_report(front_data):
    """
    Main AI Reporting Engine mapping 1:1 with Spring Boot DTO and Database schema.
    """
    print("\n[Engine] Step 1. Starting image sanitization pipeline...")
    
    # Process and sanitize all incoming image tracks
    sanitized_map = sanitize_image(front_data.get("map_image"), "temp_map.jpg")
    sanitized_before = sanitize_image(front_data.get("before_image"), "temp_before.jpg")
    sanitized_during = sanitize_image(front_data.get("during_image"), "temp_during.jpg")
    sanitized_after = sanitize_image(front_data.get("after_image"), "temp_after.jpg")

    if not sanitized_before:
        return {"error": "Missing required field: before_image"}

    raw_memo = front_data.get("field_memo")
    location_name = front_data.get("location_name")
    
    # AI Prompt Construction (Korean output optimized for public officials)
    prompt_instruction = f"""
    당신은 부산광역시 사하구청의 10년 차 베테랑 행정직 공무원이자 현장 조사 전문가입니다.
    제공된 [현장 사진]은 '{location_name}' 인근에서 촬영된 파손 현장입니다.
    사진을 면밀히 분석하고, 담당자가 작성한 [날것의 메모]를 참고하여 
    공식 행정 보고서에 들어갈 '현장 상황 요약 및 조치 의견'을 작성해 주세요.

    [작성 원칙]:
    1. 반드시 정중하고 격식 있는 공문서체(~함, ~임, ~요망)로만 기술할 것.
    2. 사진에서 판별되는 구체적인 피해 상태(균열, 위험도, 인근 시설물 상태 등)를 행정 전문가적 시각으로 서술할 것.
    3. 메모에 적힌 현장 담당자의 요구사항(차량 통제, 조치 요망 등)을 공문서 단어로 변환하여 누락 없이 녹여낼 것.

    [날것의 메모]: {raw_memo}
    [공식 보고서 내용]:
    """

    print("🤖 Step 2. Triggering Google GenAI Vision Core (Analyzing Before Image)...")
    try:
        image_object = Image.open(sanitized_before)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[image_object, prompt_instruction]
        )
        ai_refined_content = response.text
    except Exception as e:
        ai_refined_content = f"GenAI API Connection Failed: {e}"

    # 3. Memory & Infrastructure Management (Clean up temp files)
    for temp_file in ["temp_map.jpg", "temp_before.jpg", "temp_during.jpg", "temp_after.jpg"]:
        if os.path.exists(temp_file):
            os.remove(temp_file)

    # 4. Marshalling final dataset for Spring Boot / Mapping with DB entity
    final_output_dataset = {
        "location_name": location_name,
        "latitude": front_data.get("latitude"),
        "longitude": front_data.get("longitude"),
        "task_category": front_data.get("task_category"),
        "task_status": front_data.get("task_status"),
        "field_memo": raw_memo,
        "ai_refined_content": ai_refined_content,  # 👈 Maps to DB table 'task_progress.ai_refined_content'
        "image_urls": {
            "MAP": front_data.get("map_image"),
            "BEFORE": front_data.get("before_image"),
            "DURING": front_data.get("during_image"),
            "AFTER": front_data.get("after_image")
        }
    }
    return final_output_dataset

# ====================================================
# 🚀 Integration Test Simulator
# ====================================================
if __name__ == "__main__":
    # Mocking Frontend Request Data payload
    mock_request_data = {
        "location_name": "다선초등학교",
        "latitude": 35.063682,
        "longitude": 128.985493,
        "task_category": "도로 파손 / 지반 침하",
        "task_status": "작업중",
        "field_memo": "다대포 해변 도로 싱크홀 위험해보임 차량 통제해야 할 듯",
        
        "map_image": "test2.jpeg",     
        "before_image": "test2.jpeg",  
        "during_image": "test2.jpeg",  
        "after_image": "test2.jpeg"    
    }

    print("=========================================================")
    print("🛸 Saha-gu AI Assistant [Backend Pipeline Test Simulator]")
    print("=========================================================")
    
    if os.path.exists(mock_request_data["before_image"]):
        report_result = generate_sahagu_report(mock_request_data)
        
        print("\n=========================================================")
        print("✨ [Success] Parsed Output Dataset for Spring Boot / pyhwpx")
        print("=========================================================")
        print(f"📍 Location : {report_result.get('location_name')}")
        print(f"🌐 GPS      : Lat {report_result.get('latitude')} / Lng {report_result.get('longitude')}")
        print(f"🚨 Raw Memo : {report_result.get('field_memo')}")
        print("---------------------------------------------------------")
        print(f"📝 [DB Column] ai_refined_content :\n\n{report_result.get('ai_refined_content')}")
        print("---------------------------------------------------------")
        print(f"📸 [HWP Map] Image Paths : {report_result.get('image_urls')}")
        print("=========================================================\n")
    else:
        print("❌ Test Error: 'test2.jpeg' not found in current directory.")