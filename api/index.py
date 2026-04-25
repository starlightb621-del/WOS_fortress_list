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
model = genai.GenerativeModel('gemini-2.5-flash')

try:
    r = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    print(f"Redis Connection Error: {e}")
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

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        # 여러 장의 이미지를 받기 위해 리스트로 가져옵니다.
        images_b64 = data.get('images', []) # 'image'가 아니라 'images' 리스트
        
        # 만약 기존 방식(단일 이미지)으로 들어왔을 경우를 대비한 방어 코드
        if not images_b64 and data.get('image'):
            images_b64 = [data.get('image')]

        if not images_b64:
            return jsonify({"error": "업로드된 이미지가 없습니다."}), 400

        all_extracted_names = []

        # 2. 모든 이미지에 대해 순차적으로 Gemini AI 분석
        for idx, img_data in enumerate(images_b64):
            try:
                prompt = "이 이미지에서 게임 캐릭터 닉네임만 추출해줘. [길드명] 제외. 결과는 콤마(,)로만 구분."
                response = model.generate_content([
                    prompt,
                    {'mime_type': 'image/jpeg', 'data': img_data}
                ])
                names = [n.strip() for n in re.split(r'[,\n]', response.text) if n.strip()]
                all_extracted_names.extend(names)
            except Exception as e:
                print(f"이미지 {idx} 분석 중 오류: {e}")
                continue

        # 3. 마스터 데이터 로드 및 비교
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
                final_results.append({
                    "name": raw, "role": "미등록", "score": 0
                })

        # 4. 중복 제거 (여러 장에서 동일 인물이 찍혔을 경우 대비)
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        return jsonify({
            "members": unique_members,
            "count": len(unique_members)
        })

    except Exception as e:
        return jsonify({"error": str(e), "members": [], "count": 0}), 500

if __name__ == "__main__":
    app.run()
