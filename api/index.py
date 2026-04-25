import os
import re
import difflib
import json
from flask import Flask, request, jsonify
from vercel_kv import kv # Vercel KV 라이브러리 사용 가정

app = Flask(__name__)

# 마스터 명단 로드 (Vercel KV에서 읽어옴)
def get_master_data():
    try:
        data = kv.get('master_list')
        return json.loads(data) if data else []
    except:
        return []

def normalize_name(text):
    if not text: return ""
    # 1. 대소문자 통합 및 공백 제거 (가이드 3)
    text = text.lower().replace(" ", "")
    # 2. 특수문자 기준 분할 및 실제 이름 영역 추출 (가이드 9)
    # [GOM]판다곰_X 등의 패턴 대응
    parts = re.split(r'[^가-힣a-zA-Z0-9]', text)
    # 3. 'x' 제거 및 단독 글자 제외 (가이드 2)
    valid_parts = [p for p in parts if p and p != 'x']
    return valid_parts[0] if valid_parts else text

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        raw_input = data.get('names', "")
        master_data = get_master_data()
        
        # 입력 텍스트 분리 (콤마, 줄바꿈)
        input_names = [n.strip() for n in re.split(r'[,\n]', raw_input) if n.strip()]
        
        final_results = []
        for raw in input_names:
            clean_raw = normalize_name(raw)
            if not clean_raw: continue
            
            best_match = None
            highest_score = -1
            
            # 가이드 1, 6: 마스터 명단 내에서 무조건 가장 유사한 사람 찾기
            for master in master_data:
                clean_master = normalize_name(master['name'])
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                
                if score > highest_score:
                    highest_score = score
                    best_match = master
            
            # 매칭 결과 추가 (가이드 5: 1인 1캐릭)
            if best_match:
                final_results.append(best_match)

        # 중복 제거 및 최종 정렬
        seen = set()
        unique_members = []
        for res in final_results:
            if res['name'] not in seen:
                unique_members.append(res)
                seen.add(res['name'])

        # 가이드 7, 8: 순번, 이름, 직책만 포함하여 반환
        return jsonify({
            "members": unique_members,
            "count": len(unique_members)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
