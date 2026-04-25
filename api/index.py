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

# 1. 환경 변수 설정
REDIS_URL = os.getenv('REDIS_URL')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')
executor = ThreadPoolExecutor(max_workers=10) # 병렬 처리를 위한 일꾼들

try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    r = None

def get_master_data():
    try:
        if r:
            data = r.get('master_list')
            if data:
                parsed = json.loads(data)
                if isinstance(parsed, dict) and 'members' in parsed:
                    member_dict = parsed['members']
                    return [{"name": k, "rank": v.get("rank"), "type": v.get("type")} for k, v in member_dict.items()]
                return parsed
        return []
    except Exception as e:
        return []

def normalize_name(text):
    if not text: return ""
    text = re.sub(r'\(.*\)', '', text)
    clean = re.sub(r'[^가-힣a-zA-Z0-9]', '', text.lower())
    return clean

# Gemini에게 분석을 요청하는 단일 작업
def ask_gemini(img_data):
    try:
        prompt = "이미지에서 게임 캐릭터 닉네임만 추출해줘. [길드명] 제외. 결과는 콤마(,)로만 구분해."
        response = model.generate_content([
            prompt,
            {'mime_type': 'image/jpeg', 'data': img_data}
        ])
        return [n.strip() for n in re.split(r'[,\n]', response.text) if n.strip()]
    except:
        return []

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        images_b64 = data.get('images', [])
        
        if not images_b64 and data.get('image'):
            images_b64 = [data.get('image')]

        if not images_b64:
            return jsonify({"error": "이미지가 없습니다."}), 400

        # 2. 병렬로 Gemini 분석 실행 (속도 향상의 핵심!)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # 여러 명의 요리사(Thread)에게 동시에 사진을 맡깁니다.
        results = list(executor.map(ask_gemini, images_b64))
        
        all_extracted_names = []
        for res in results:
            all_extracted_names.extend(res)

        # 3. 명단 대조 및 보정
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
                    highest_score = score
                    best_match = master
            
            if best_match and highest_score > 0.4:
                final_results.append({
                    "name": best_match['name'],
                    "role": f"{best_match.get('type', '멤버')}({best_match.get('rank', '-')})",
                    "score": round(highest_score, 2)
                })
            else:
                final_results.append({"name": raw, "role": "미등록", "score": 0})

        # 4. 중복 제거
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        return jsonify({"members": unique_members, "count": len(unique_members)})

    except Exception as e:
        return jsonify({"error": str(e), "members": [], "count": 0}), 500

if __name__ == "__main__":
    app.run()
