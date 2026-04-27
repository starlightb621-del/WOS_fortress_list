import os
import json
import re
import concurrent.futures
from flask import Flask, request, jsonify
import google.generativeai as genai
import redis
from difflib import SequenceMatcher
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# --- Configuration ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
REDIS_URL = os.environ.get("REDIS_URL")
MASTER_LIST_FILE = os.path.join(os.path.dirname(__file__), "master_list.json")

# Initialize Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # [중요] 모델은 절대 1.5 버전으로 교체 금지. 2.5 버전 이상 유지. 현재 Gemini 3 Flash 사용.
    model = genai.GenerativeModel('gemini-3-flash')
kv = None
if REDIS_URL:
    kv = redis.from_url(REDIS_URL, decode_responses=True)

# --- Helper Functions ---
def clean_raw_name(name):
    if not name: return ""
    # 1. 연맹 태그 및 괄호 제거 ([GOM], (GOM) 등)
    name = re.sub(r'\[.*?\]', '', name)
    name = re.sub(r'\(.*?\)', '', name)
    
    # 2. 양 끝의 특수문자 및 기호 제거
    name = re.sub(r'^[^a-zA-Z0-9가-힣]+', '', name)
    name = re.sub(r'[^a-zA-Z0-9가-힣]+$', '', name)
    
    # 3. 한글이 포함된 경우, 한글 2자 이상의 핵심 부분 추출 (노이즈 제거)
    korean_match = re.search(r'([가-힣]{2,})', name)
    if korean_match:
        return korean_match.group(1).strip()
        
    return name.strip()

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def calculate_score(raw, master):
    # 특수문자 및 공백을 완전히 제거하고 대문자로 변환하여 비교
    r = re.sub(r'[^a-zA-Z0-9가-힣]', '', raw).upper()
    m = re.sub(r'[^a-zA-Z0-9가-힣]', '', master).upper()
    
    if not r or not m: return 0
    
    # 1. 완전 일치
    if r == m:
        return 100
    
    # 2. 별칭(괄호 안) 체크
    alias_match = re.search(r'\((.*?)\)', master)
    if alias_match:
        alias = re.sub(r'[^a-zA-Z0-9가-힣]', '', alias_match.group(1)).upper()
        if r == alias or alias == r:
            return 100

    # 3. 포함 관계
    if r in m or m in r:
        return 90
        
    # 4. 유사도 매칭 (Levenshtein)
    dist = levenshtein_distance(r, m)
    max_len = max(len(r), len(m))
    score = (1 - dist / max_len) * 100
    return score

def get_master_list():
    if kv:
        data = kv.get("master_list")
        if data:
            return json.loads(data)
    
    # Fallback to file
    if os.path.exists(MASTER_LIST_FILE):
        with open(MASTER_LIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"members": {}, "last_updated": ""}

def save_master_list(data):
    if kv:
        kv.set("master_list", json.dumps(data))
    with open(MASTER_LIST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# --- Endpoints ---

@app.route('/api/master', methods=['GET', 'POST'])
def master_list_route():
    if request.method == 'GET':
        return jsonify(get_master_list())
    else:
        # POST: Save entire list
        data = request.json
        save_master_list(data)
        return jsonify({"success": True})

@app.route('/api/scan', methods=['POST'])
def scan_images():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API Key not configured"}), 500
    
    data = request.json
    images_base64 = data.get("images", []) # List of base64 strings
    
    if not images_base64:
        return jsonify({"error": "No images provided"}), 400

    all_extracted_names = []
    
    # AI 프롬프트 가이드라인
    system_instruction = (
        "너는 WOS 게임의 연맹 관리자이다. 업로드된 스크린샷에서 모든 유저의 닉네임을 추출하라.\n"
        "오직 닉네임만 추출할 것.\n"
        "응답은 반드시 JSON Array [ \"이름1\", \"이름2\", ... ] 형식으로만 출력할 것."
    )

    def analyze_single_image(b64):
        try:
            parts = [system_instruction, {"mime_type": "image/jpeg", "data": b64}]
            response = model.generate_content(parts)
            text = response.text
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                return json.loads(match.group())
        except Exception as e:
            print(f"Image analysis error: {e}")
        return []

    try:
        # 병렬 처리 (RPM 제한 내에서 최대 성능)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_to_image = {executor.submit(analyze_single_image, b64): b64 for b64 in images_base64}
            for future in concurrent.futures.as_completed(future_to_image):
                all_extracted_names.extend(future.result())
                
        # 중복 제거
        all_extracted_names = list(set(all_extracted_names))
        
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg:
            return jsonify({"error": "Gemini API 할당량 초과 (429). 잠시 후 다시 시도해주세요."}), 429
        return jsonify({"error": f"Gemini Error: {error_msg}"}), 500

    # 2. 매칭 엔진 적용
    master_data = get_master_list()
    members = master_data.get("members", {})
    
    results = []
    seen = set()
    
    for raw_name in all_extracted_names:
        cleaned_raw = clean_raw_name(raw_name)
        if not cleaned_raw: continue
        
        best_match = None
        highest_score = 0
        
        for m_name in members.keys():
            score = calculate_score(cleaned_raw, m_name)
            if score > highest_score:
                highest_score = score
                best_match = m_name
        
        # 임계값(Threshold): 50점
        if highest_score >= 50:
            matched_name = best_match
            if matched_name not in seen:
                info = members[matched_name]
                results.append({
                    "name": matched_name,
                    "rank": info.get("rank", "R3"),
                    "type": info.get("type", "본캐")
                })
                seen.add(matched_name)
        else:
            # 매칭 실패
            if raw_name not in seen:
                results.append({
                    "name": raw_name,
                    "rank": "R3",
                    "type": "미등록"
                })
                seen.add(raw_name)
                
    # Sort: Type priority (운영진 > 본캐 > 부캐 > 미등록), then Name
    type_priority = {"운영진": 0, "본캐": 1, "부캐": 2, "미등록": 3}
    results.sort(key=lambda x: (type_priority.get(x["type"], 4), x["name"]))
    
    return jsonify({"results": results})


@app.route('/api/participation', methods=['GET'])
def participation_get():
    time_slot = request.args.get("time", "12시")
    if kv:
        data = kv.get(f"participation_{time_slot}")
        if data:
            return jsonify(json.loads(data))
    return jsonify([])

@app.route('/api/participation', methods=['POST'])
def participation_post():
    data = request.json
    time_slot = data.get("time")
    list_data = data.get("list", [])
    
    if not time_slot:
        return jsonify({"error": "Time slot required"}), 400
        
    if kv:
        kv.set(f"participation_{time_slot}", json.dumps(list_data))
        
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True)
