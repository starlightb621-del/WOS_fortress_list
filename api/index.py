import os
import re
import json
import difflib
import requests
from flask import Flask, request, jsonify
import google.generativeai as genai

app = Flask(__name__)

# 1. 환경 변수 설정 (Vercel 대시보드에서 설정 필요)
KV_URL = os.getenv('KV_REST_API_URL')
KV_TOKEN = os.getenv('KV_REST_API_TOKEN')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Gemini AI 설정
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

def get_master_data():
    """Vercel KV에서 마스터 명단을 가져옵니다."""
    try:
        headers = {'Authorization': f'Bearer {KV_TOKEN}'}
        res = requests.get(f"{KV_URL}/get/master_list", headers=headers)
        data = res.json().get('result')
        return json.loads(data) if data else []
    except Exception as e:
        print(f"KV Error: {e}")
        return []

def normalize_name(text):
    """
    보정 가이드라인 적용:
    - 가이드 2: 'X' 제거
    - 가이드 3: 대소문자 및 공백 통합
    - 가이드 9: 특수문자 기준 이름 추출
    """
    if not text: return ""
    
    # 소문자 변환 및 모든 공백 제거 (가이드 3)
    text = text.lower().replace(" ", "")
    
    # 특수문자([...], _, - 등)를 기준으로 분할 (가이드 9)
    parts = re.split(r'[^가-힣a-zA-Z0-9]', text)
    
    # 'x' 글자 단독 제외 및 가장 적합한 이름 후보군 필터링 (가이드 2)
    valid_parts = [p for p in parts if p and p != 'x' and len(p) >= 2]
    
    # 적절한 후보가 없으면 원본에서 특수문자만 제거한 값 반환
    return valid_parts[0] if valid_parts else re.sub(r'[^가-힣a-zA-Z0-9]', '', text)

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        image_b64 = data.get('image')
        master_data = get_master_data()
        
        if not image_b64:
            return jsonify({"error": "No image data"}), 400

        # 2. Gemini AI를 이용한 이름 추출
        prompt = "이미지 속 게임 캐릭터 닉네임들을 전부 나열해줘. 콤마(,)로 구분하고 다른 설명은 하지 마."
        response = model.generate_content([
            prompt,
            {'mime_type': 'image/jpeg', 'data': image_b64}
        ])
        
        raw_text = response.text
        # 추출된 텍스트를 콤마나 줄바꿈으로 분리
        extracted_names = [n.strip() for n in re.split(r'[,\n]', raw_text) if n.strip()]
        
        final_results = []
        
        # 3. 보정 및 매칭 로직 (가이드 1, 6)
        for raw in extracted_names:
            clean_raw = normalize_name(raw)
            if not clean_raw: continue
            
            best_match = None
            highest_score = -1
            
            for master in master_data:
                clean_master = normalize_name(master['name'])
                
                # 유사도 계산
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                
                if score > highest_score:
                    highest_score = score
                    best_match = master
            
            # 유사도가 일정 수준 이상이면 매칭 (무조건 매칭 가이드 반영)
            if best_match and highest_score > 0.3:
                final_results.append(best_match)
            else:
                # 마스터 명단에 전혀 없는 새로운 이름인 경우
                final_results.append({"name": clean_raw, "role": "미등록"})

        # 4. 중복 제거 (가이드 5)
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        # 가이드 7, 8: 순번, 이름, 직책 출력을 위한 데이터 반환
        return jsonify({
            "members": unique_members,
            "count": len(unique_members)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 명단 관리용 API (GET: 로드, POST: 저장)
@app.route('/api/master', methods=['GET', 'POST'])
def manage_master():
    headers = {'Authorization': f'Bearer {KV_TOKEN}'}
    if request.method == 'GET':
        return jsonify(get_master_data())
    else:
        new_list = request.json.get('master_list', [])
        payload = {"result": json.dumps(new_list)}
        requests.post(f"{KV_URL}/set/master_list", headers=headers, data=json.dumps(new_list))
        return jsonify({"status": "success"})

if __name__ == "__main__":
    app.run()
