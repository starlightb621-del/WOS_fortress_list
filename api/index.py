import os
import re
import difflib
import json
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# Vercel KV 설정 (환경 변수 자동 로드)
KV_URL = os.getenv('KV_REST_API_URL')
KV_TOKEN = os.getenv('KV_REST_API_TOKEN')

def get_kv_data():
    headers = {'Authorization': f'Bearer {KV_TOKEN}'}
    res = requests.get(f"{KV_URL}/get/master_list", headers=headers)
    data = res.json().get('result')
    return json.loads(data) if data else []

def set_kv_data(data_list):
    headers = {'Authorization': f'Bearer {KV_TOKEN}', 'Content-Type': 'application/json'}
    payload = json.dumps(data_list)
    requests.post(f"{KV_URL}/set/master_list", headers=headers, data=json.dumps(payload))

def normalize_name(text):
    if not text: return ""
    text = text.lower().replace(" ", "")
    parts = re.split(r'[^가-힣a-zA-Z0-9]', text)
    # 가이드: 'x'는 제거하고 가장 의미 있는 닉네임 부분 선택
    valid_parts = [p for p in parts if p and p != 'x']
    return valid_parts[0] if valid_parts else text

# --- API 엔드포인트 ---

@app.route('/api/master', methods=['GET', 'POST'])
def manage_master():
    if request.method == 'GET':
        return jsonify(get_kv_data())
    else:
        # 새로운 마스터 명단 저장
        new_list = request.json.get('master_list', [])
        set_kv_data(new_list)
        return jsonify({"status": "success"})

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        raw_input = data.get('names', "")
        master_data = get_kv_data()
        
        input_names = [n.strip() for n in re.split(r'[,\n]', raw_input) if n.strip()]
        final_results = []

        for raw in input_names:
            clean_raw = normalize_name(raw)
            if not clean_raw: continue
            
            best_match = None
            highest_score = -1
            
            for master in master_data:
                clean_master = normalize_name(master['name'])
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                if score > highest_score:
                    highest_score = score
                    best_match = master
            
            if best_match and highest_score > 0.3: # 유사도가 너무 낮으면 패스
                final_results.append(best_match)

        # 중복 제거 (1인 1캐릭)
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        return jsonify({"members": unique_members, "count": len(unique_members)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
