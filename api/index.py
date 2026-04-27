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
    # [중요] 명세서 지침에 따라 2.5 버전 이상 유지 (1.5 사용 금지)
    model = genai.GenerativeModel('gemini-2.5-flash')
kv = None
if REDIS_URL:
    kv = redis.from_url(REDIS_URL, decode_responses=True)

# --- Helper Functions ---
def clean_raw_name(name):
    if not name: return ""
    # 1. 연맹 태그 제거 ([GOM] 등)
    name = re.sub(r'\[.*?\]', '', name)
    # 2. 괄호 내용 제거 (별칭 등)
    name = re.sub(r'\(.*?\)', '', name)
    # 3. 양 끝의 불필요한 특수문자 제거 (한자 \u4e00-\u9fff 포함)
    name = re.sub(r'^[^a-zA-Z0-9가-힣\u4e00-\u9fff]+', '', name)
    name = re.sub(r'[^a-zA-Z0-9가-힣\u4e00-\u9fff]+$', '', name)
    
    # 4. 공백 정규화 (연속된 공백을 하나로)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2): return levenshtein_distance(s2, s1)
    if len(s2) == 0: return len(s1)
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
    # 특수문자, 기호, 공백을 모두 제거하고 비교 (한자 포함)
    r = re.sub(r'[^a-zA-Z0-9가-힣\u4e00-\u9fff]', '', raw).upper()
    m = re.sub(r'[^a-zA-Z0-9가-힣\u4e00-\u9fff]', '', master).upper()
    
    if not r or not m: return 0
    if r == m: return 100
    
    # 별칭(괄호 안) 체크
    alias_match = re.search(r'\((.*?)\)', master)
    if alias_match:
        alias = re.sub(r'[^a-zA-Z0-9가-힣\u4e00-\u9fff]', '', alias_match.group(1)).upper()
        if r == alias or alias == r: return 100
    
    # 포함 관계 체크
    if r in m or m in r: return 90
    
    # 레벤슈타인 거리
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
        "너는 WOS 게임의 연맹 관리자이다. 제공된 여러 장의 스크린샷을 모두 꼼꼼하게 분석하라.\n"
        "각 스크린샷에 등장하는 모든 유저의 닉네임을 하나도 빠뜨리지 말고 추출해야 한다.\n"
        "중복된 이름은 최종 결과에서 하나로 합치되, 모든 이미지의 데이터를 전수 조사하라.\n"
        "응답은 반드시 JSON Array [ \"이름1\", \"이름2\", ... ] 형식으로만 출력할 것."
    )

    # 할당량 보호 및 효율을 위해 배치 사이즈 조정 (10장)
    batch_size = 10
    errors = []
    
    for i in range(0, len(images_base64), batch_size):
        batch = images_base64[i : i + batch_size]
        try:
            parts = [system_instruction]
            for b64 in batch:
                parts.append({"mime_type": "image/jpeg", "data": b64})
            
            response = model.generate_content(parts)
            if response.text:
                match = re.search(r'\[.*\]', response.text, re.DOTALL)
                if match:
                    names = json.loads(match.group())
                    all_extracted_names.extend(names)
                else:
                    errors.append(f"Batch {i//batch_size + 1}: JSON 형식을 찾을 수 없습니다.")
            
            # 다음 배치 전 할당량 안정을 위해 잠시 대기
            if len(images_base64) > batch_size:
                time.sleep(2.0)
                
        except Exception as e:
            errors.append(f"Batch {i//batch_size + 1} Error: {str(e)}")
            if "429" in str(e):
                time.sleep(10) # 429 발생 시 더 길게 대기

    if not all_extracted_names and errors:
        return jsonify({"error": "; ".join(errors[:2])}), 500

    # 매칭 엔진 적용
    master_data = get_master_list()
    members = master_data.get("members", {})
    results = []
    seen = set()
    
    # 중복 제거 후 매칭
    unique_extracted = list(set(all_extracted_names))
    
    for raw_name in unique_extracted:
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
    if request.method == 'GET': return jsonify(get_master_list())
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
