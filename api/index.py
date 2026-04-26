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
    model = genai.GenerativeModel('gemini-1.5-flash')
kv = None
if REDIS_URL:
    kv = redis.from_url(REDIS_URL, decode_responses=True)

# --- Helper Functions ---
def normalize_name(name):
    if not name: return ""
    # Remove tags like [GOM], (GOM), special chars, emojis
    cleaned = re.sub(r'\[.*?\]|\(.*?\)|[^가-힣a-zA-Z0-9]', '', name)
    return cleaned.strip().upper()

def get_similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

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
    
    try:
        for b64 in images_base64:
            # Prepare parts for Gemini
            parts = [
                "이미지에서 화이트아웃 서바이벌(WOS) 게임의 연맹원 닉네임을 모두 추출해줘. "
                "반드시 JSON 형식으로 {\"names\": [\"닉네임1\", \"닉네임2\"]} 형태로만 반환해."
            ]
            parts.append({"mime_type": "image/jpeg", "data": b64})
            
            response = model.generate_content(parts)
            text = response.text
            
            # Extract JSON
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                all_extracted_names.extend(parsed.get("names", []))
    except Exception as e:
        return jsonify({"error": f"Gemini Error: {str(e)}"}), 500

    # Process and Match
    master_data = get_master_list()
    members = master_data.get("members", {})
    master_names = list(members.keys())
    
    results = []
    seen = set()
    
    for raw_name in all_extracted_names:
        norm_raw = normalize_name(raw_name)
        if not norm_raw: continue
        
        best_match = None
        highest_score = 0
        
        for m_name in master_names:
            norm_master = normalize_name(m_name)
            score = get_similarity(norm_raw, norm_master)
            
            # Strong match check
            if norm_raw == norm_master:
                score = 1.0
            elif norm_raw in norm_master or norm_master in norm_raw:
                score = max(score, 0.8)
                
            if score > highest_score:
                highest_score = score
                best_match = m_name
        
        # Threshold 0.5 as per spec
        if highest_score >= 0.5:
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
            # Unmatched
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
