import os
import json
import re
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
    model = genai.GenerativeModel('gemini-2.5-flash')
kv = None
if REDIS_URL:
    kv = redis.from_url(REDIS_URL, decode_responses=True)

# --- Helper Functions ---
def clean_raw_name(name):
    if not name: return ""
    # 1.1 장식 문자 및 기호 제거
    # ^[^a-zA-Z0-9가-힣]+ (시작 기호 제거)
    # [^a-zA-Z0-9가-힣]+$ (끝 기호 제거)
    name = re.sub(r'^[^a-zA-Z0-9가-힣]+', '', name)
    name = re.sub(r'[^a-zA-Z0-9가-힣]+$', '', name)
    
    # 1.2 연맹 태그 제거 ([GOM] 등)
    name = re.sub(r'\[.*?\]', '', name)
    
    # 1.2 한글 우선 추출 (한글 + 공백 + 영문 형태일 때 한글 2자 이상 우선)
    # 예: "누나곰 Nuna" -> "누나곰"
    korean_match = re.search(r'([가-힣]{2,})\s+[a-zA-Z]+', name)
    if korean_match:
        return korean_match.group(1)
        
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
    # 공백을 완전히 제거한 상태에서 비교
    r = raw.replace(" ", "")
    m = master.replace(" ", "")
    
    # 2.2 우선순위 필터링
    # 1. 완전 일치
    if r == m:
        return 100
    
    # 별칭(괄호 안) 체크 - 마스터 이름에 괄호가 있는 경우 처리
    alias_match = re.search(r'\((.*?)\)', master)
    if alias_match:
        alias = alias_match.group(1).replace(" ", "")
        if r == alias:
            return 100

    # 2. 포함 관계
    if r in m or m in r:
        return 90
        
    # 3. 유사도 매칭 (Levenshtein)
    if not r or not m: return 0
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
    
    # 4. AI 프롬프트 가이드라인 적용
    system_instruction = (
        "너는 WOS 게임의 연맹 관리자이다. 업로드된 스크린샷에서 모든 유저의 닉네임을 추출하라.\n"
        "오직 닉네임만 추출할 것.\n"
        "중복된 이름은 하나로 합칠 것.\n"
        "응답은 반드시 JSON Array [ \"이름1\", \"이름2\", ... ] 형식으로만 출력할 것."
    )

    try:
        # 3. 병렬 처리 아키텍처 (백엔드에서도 비동기로 처리하면 좋으나, 
        # 일단 순차 처리하되 프롬프트를 최적화함. 사용자 요청에 따라 로직만 수정)
        for b64 in images_base64:
            parts = [system_instruction]
            parts.append({"mime_type": "image/jpeg", "data": b64})
            
            response = model.generate_content(parts)
            text = response.text
            
            # Extract JSON Array [ "이름1", "이름2", ... ]
            match = re.search(r'\[.*\]', text, re.DOTALL)
            if match:
                names = json.loads(match.group())
                all_extracted_names.extend(names)
    except Exception as e:
        return jsonify({"error": f"Gemini Error: {str(e)}"}), 500

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
