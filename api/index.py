import os
import re
import json
import difflib
import redis
import asyncio
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from concurrent.futures import ThreadPoolExecutor

app = Flask(__name__)
CORS(app)

# 환경 변수 및 AI 설정
REDIS_URL = os.getenv('REDIS_URL')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')
executor = ThreadPoolExecutor(max_workers=10)

try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
except:
    r = None

def get_master_data():
    """Redis에서 코랩이 저장한 명단 데이터를 가져옴"""
    try:
        if r:
            data = r.get('master_list')
            if data:
                parsed = json.loads(data)
                # 코랩 데이터 구조 지원: {'members': {'닉네임': {...}}}
                if isinstance(parsed, dict) and 'members' in parsed:
                    member_dict = parsed['members']
                    return [{"name": k, "rank": v.get("rank"), "type": v.get("type")} for k, v in member_dict.items()]
                return parsed
        return []
    except:
        return []

def normalize_name(text):
    """이름 보정: 괄호 제거 및 특수문자 제거"""
    if not text: return ""
    text = re.sub(r'\(.*\)', '', text)
    return re.sub(r'[^가-힣a-zA-Z0-9]', '', text.lower())

def ask_gemini(img_data):
    """Gemini에게 개별 이미지 분석 요청"""
    try:
        prompt = "이 이미지에서 캐릭터 닉네임만 추출해서 콤마(,)로 구분해줘. [길드명]은 제외해."
        response = model.generate_content([prompt, {'mime_type': 'image/jpeg', 'data': img_data}])
        return [n.strip() for n in re.split(r'[,\n]', response.text) if n.strip()]
    except:
        return []

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        images_b64 = data.get('images', [])
        
        # 1. 병렬 처리로 모든 이미지 분석
        results = list(executor.map(ask_gemini, images_b64))
        all_extracted_names = [name for res in results for name in res]

        # 2. 마스터 명단 대조
        master_list = get_master_data()
        final_results = []

        for raw in all_extracted_names:
            clean_raw = normalize_name(raw)
            if not clean_raw: continue
            
            best_match = None
            highest_score = -1
            
            for master in master_list:
                clean_master = normalize_name(master['name'])
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                if score > highest_score:
                    highest_score, best_match = score, master
            
            # 유사도 40% 이상이면 매칭 성공으로 간주
            if best_match and highest_score > 0.4:
                final_results.append({
                    "name": best_match['name'],
                    "role": f"{best_match.get('type', '멤버')}({best_match.get('rank', '-')})",
                    "score": round(highest_score, 2)
                })
            else:
                final_results.append({"name": raw, "role": "미등록", "score": 0})

        # 3. 중복 제거
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res); seen.add(res['name'])

        return jsonify({"members": unique_members, "count": len(unique_members)})
    except Exception as e:
        return jsonify({"error": str(e), "members": [], "count": 0}), 500

if __name__ == "__main__":
    app.run()
