from flask import Flask, request, jsonify
import difflib
import re
import os

app = Flask(__name__)

# 1. 환경 변수에서 API 키 로드 (보안)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')

# 2. 실제 마스터 명단 (보내주신 이미지 기반 확장 가능)
# 나중에 이 부분을 master_list.json 파일에서 읽어오게 수정하면 더 좋습니다.
master_data = [
    {"name": "엄마곰", "role": "운영진"},
    {"name": "아빠곰", "role": "운영진"},
    {"name": "팔쪽이", "role": "운영진"},
    {"name": "데헷판다곰", "role": "운영진"},
    {"name": "누나곰", "role": "운영진"},
    {"name": "아이스곰", "role": "멤버"},
    {"name": "말랑곰", "role": "멤버"}
]

def normalize_name(text):
    if not text: return ""
    # [GOM] 태그 제거
    text = re.sub(r'\[.*?\]', '', text)
    # 특수문자 및 이모지 제거 (한글, 영문, 숫자만 남김)
    text = re.sub(r'[^가-힣a-zA-Z0-9]', '', text)
    # 이미지에서 자주 발생하는 'X'나 'x' 처리 (참여 여부 표시 등)
    if len(text) > 1 and (text.endswith('X') or text.endswith('x')):
        text = text[:-1]
    return text.strip()

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        raw_input = data.get('names', "")
        
        # 입력이 리스트인지 문자열인지 확인
        if isinstance(raw_input, str):
            # 줄바꿈, 콤마, 공백으로 분리
            ocr_names = [n.strip() for n in re.split(r'[,\n\s]', raw_input) if n.strip()]
        else:
            ocr_names = raw_input

        final_results = []
        for raw_name in ocr_names:
            clean_raw = normalize_name(raw_name)
            if not clean_raw: continue
            
            best_match = None
            highest_score = 0
            
            for master in master_data:
                clean_master = normalize_name(master['name'])
                # SequenceMatcher로 유사도 계산
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                
                if score > highest_score:
                    highest_score = score
                    if score >= 0.4: # 유사도 기준치 (0.4 정도로 낮춰서 오타 수용폭 확대)
                        best_match = {
                            "name": master['name'], 
                            "role": master['role'], 
                            "score": round(score, 2),
                            "original": raw_name
                        }
            
            # 매칭 결과가 없으면 신규로 처리
            if not best_match:
                best_match = {
                    "name": clean_raw, 
                    "role": "신규/미등록", 
                    "score": 0, 
                    "original": raw_name
                }
            
            final_results.append(best_match)

        # 결과 정렬 및 중복 제거 (보정된 이름 기준)
        seen = set()
        unique_results = []
        for res in final_results:
            if res['name'] not in seen:
                unique_results.append(res)
                seen.add(res['name'])

        return jsonify({
            "count": len(unique_results),
            "members": unique_results
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run()
