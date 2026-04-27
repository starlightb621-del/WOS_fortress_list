import os
import json
import re
import time
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
    # [중요] 사용자의 요청에 따라 2.5 버전 이상 유지. 
    # Gemini 3-flash가 작동하지 않을 경우를 대비해 기존 검증된 2.5-flash로 우선 복구하되,
    # 최신 모델인 2.0-flash-exp 등을 고려할 수 있습니다. 
    # 일단 사용자가 명시한 2.5-flash로 복구하여 작동 여부를 확인합니다.
    model = genai.GenerativeModel('gemini-2.5-flash')
kv = None
if REDIS_URL:
    kv = redis.from_url(REDIS_URL, decode_responses=True)

# --- Helper Functions ---
def clean_raw_name(name):
    if not name: return ""
    # 1. 연맹 태그 및 괄호 제거
    name = re.sub(r'\[.*?\]', '', name)
    name = re.sub(r'\(.*?\)', '', name)
    
    # 2. 양 끝 특수문자 제거
    name = re.sub(r'^[^a-zA-Z0-9가-힣]+', '', name)
    name = re.sub(r'[^a-zA-Z0-9가-힣]+$', '', name)
    
    # 3. 한글 2자 이상 추출
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
    r = re.sub(r'[^a-zA-Z0-9가-힣]', '', raw).upper()
    m = re.sub(r'[^a-zA-Z0-9가-힣]', '', master).upper()
    if not r or not m: return 0
    if r == m: return 100
    alias_match = re.search(r'\((.*?)\)', master)
    if alias_match:
        alias = re.sub(r'[^a-zA-Z0-9가-힣]', '', alias_match.group(1)).upper()
        if r == alias or alias == r: return 100
    if r in m or m in r: return 90
    dist = levenshtein_distance(r, m)
    max_len = max(len(r), len(m))
    return (1 - dist / max_len) * 100

def get_master_list():
    if kv:
        data = kv.get("master_list")
        if data: return json.loads(data)
    if os.path.exists(MASTER_LIST_FILE):
        with open(MASTER_LIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"members": {}, "last_updated": ""}

# --- Endpoints ---

@app.route('/api/scan', methods=['POST'])
def scan_images():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API Key not configured"}), 500
    
    data = request.json
    images_base64 = data.get("images", [])
    if not images_base64:
        return jsonify({"error": "No images provided"}), 400

    all_extracted_names = []
    system_instruction = (
        "너는 WOS 게임의 연맹 관리자이다. 업로드된 스크린샷에서 모든 유저의 닉네임을 추출하라.\n"
        "오직 닉네임만 추출할 것.\n"
        "응답은 반드시 JSON Array [ \"이름1\", \"이름2\", ... ] 형식으로만 출력할 것."
    )

    # 429 오류 방지를 위해 순차 처리하되, 이미지 한 장당 분석 품질을 높입니다.
    errors = []
    for i, b64 in enumerate(images_base64):
        try:
            parts = [system_instruction, {"mime_type": "image/jpeg", "data": b64}]
            response = model.generate_content(parts)
            
            if not response.text:
                errors.append(f"Image {i+1}: AI가 텍스트를 생성하지 못했습니다. (Safety Filter 등)")
                continue
                
            match = re.search(r'\[.*\]', response.text, re.DOTALL)
            if match:
                names = json.loads(match.group())
                all_extracted_names.extend(names)
            else:
                errors.append(f"Image {i+1}: JSON 형식을 찾을 수 없습니다.")
        except Exception as e:
            errors.append(f"Image {i+1} Error: {str(e)}")
            # 만약 429 오류라면 잠시 대기
            if "429" in str(e):
                time.sleep(2)

    if not all_extracted_names and errors:
        return jsonify({"error": "; ".join(errors[:3])}), 500

    # 매칭 엔진
    master_data = get_master_list()
    members = master_data.get("members", {})
    results = []
    seen = set()
    
    for raw_name in list(set(all_extracted_names)):
        cleaned_raw = clean_raw_name(raw_name)
        if not cleaned_raw: continue
        
        best_match = None
        highest_score = 0
        for m_name in members.keys():
            score = calculate_score(cleaned_raw, m_name)
            if score > highest_score:
                highest_score = score
                best_match = m_name
        
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
            if raw_name not in seen:
                results.append({"name": raw_name, "rank": "R3", "type": "미등록"})
                seen.add(raw_name)
                
    type_priority = {"운영진": 0, "본캐": 1, "부캐": 2, "미등록": 3}
    results.sort(key=lambda x: (type_priority.get(x["type"], 4), x["name"]))
    
    return jsonify({"results": results})

@app.route('/api/master', methods=['GET', 'POST'])
def master_list_route():
    if request.method == 'GET':
        return jsonify(get_master_list())
    else:
        data = request.json
        if kv: kv.set("master_list", json.dumps(data))
        with open(MASTER_LIST_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"success": True})

@app.route('/api/participation', methods=['GET', 'POST'])
def participation_route():
    if request.method == 'GET':
        time_slot = request.args.get("time", "12시")
        if kv:
            data = kv.get(f"participation_{time_slot}")
            if data: return jsonify(json.loads(data))
        return jsonify([])
    else:
        data = request.json
        time_slot = data.get("time")
        list_data = data.get("list", [])
        if kv: kv.set(f"participation_{time_slot}", json.dumps(list_data))
        return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True)
