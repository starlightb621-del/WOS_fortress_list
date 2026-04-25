import os
import re
import json
import difflib
import redis
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai

app = Flask(__name__)
CORS(app)

# 1. 환경 변수 설정
REDIS_URL = os.getenv('REDIS_URL')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# Redis 연결 (SSL 설정을 코랩과 동일하게 False로 맞추는 것이 안전할 수 있습니다)
try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    print(f"Redis Connection Error: {e}")
    r = None

def get_master_data():
    """코랩에서 저장한 {'members': {'닉네임': {...}}} 구조를 리스트로 변환합니다."""
    try:
        if r:
            data = r.get('master_list')
            if data:
                parsed = json.loads(data)
                # 만약 코랩 구조처럼 'members' 키가 있다면 그 안의 내용을 추출
                if isinstance(parsed, dict) and 'members' in parsed:
                    member_dict = parsed['members']
                    return [{"name": k, "rank": v.get("rank"), "type": v.get("type")} for k, v in member_dict.items()]
                return parsed # 이미 리스트 형태라면 그대로 반환
        return []
    except Exception as e:
        print(f"KV Load Error: {e}")
        return []

def normalize_name(text):
    if not text: return ""
    # 괄호와 그 안의 내용 제거 (예: ILYSM(아보카도) -> ILYSM)
    text = re.sub(r'\(.*\)', '', text)
    # 특수문자 제거 및 소문자화
    clean = re.sub(r'[^가-힣a-zA-Z0-9]', '', text.lower())
    return clean

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        image_b64 = data.get('image')
        
        if not image_b64:
            return jsonify({"error": "이미지가 없습니다."}), 400

        # 1. Gemini AI 추출
        prompt = "이미지에서 게임 캐릭터 닉네임만 추출해줘. [길드명]은 제외해. 결과는 콤마(,)로만 구분해줘."
        response = model.generate_content([
            prompt,
            {'mime_type': 'image/jpeg', 'data': image_b64}
        ])
        
        input_names = [n.strip() for n in re.split(r'[,\n]', response.text) if n.strip()]

        # 2. 마스터 데이터 로드 및 비교
        master_list = get_master_data()
        final_results = []

        for raw in input_names:
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
            
            if best_match and highest_score > 0.4: # 유사도 기준 0.4로 완화
                final_results.append({
                    "name": best_match['name'],
                    "role": f"{best_match.get('type', '멤버')}({best_match.get('rank', '-')})",
                    "score": round(highest_score, 2)
                })
            else:
                final_results.append({
                    "name": raw,
                    "role": "미등록",
                    "score": 0
                })

        # 3. 중복 제거
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        # 웹앱이 기다리는 'members'와 'count' 형식을 정확히 반환
        return jsonify({
            "members": unique_members,
            "count": len(unique_members)
        })

    except Exception as e:
        print(f"Server Error: {e}")
        return jsonify({"error": str(e), "members": [], "count": 0}), 500

if __name__ == "__main__":
    app.run()
