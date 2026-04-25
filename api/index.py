from flask import Flask, request, jsonify
import difflib
import re

app = Flask(__name__)

# 마스터 명단 데이터
master_data = [
    {"name": "아빠곰", "role": "운영진"},
    {"name": "엄마곰", "role": "멤버"},
    {"name": "팔쪽이", "role": "멤버"},
    {"name": "아이스곰", "role": "멤버"},
    {"name": "불곰", "role": "운영진"}
]

def normalize_name(text):
    if not text: return ""
    clean_text = re.sub(r'\[.*?\]', '', text)
    clean_text = re.sub(r'[^가-힣a-zA-Z0-9]', '', clean_text)
    return clean_text.strip()

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        # 줄바꿈이나 콤마로 구분된 입력을 처리
        raw_input = data.get('names', "")
        if isinstance(raw_input, str):
            ocr_names = [n.strip() for n in re.split(r'[,\n]', raw_input) if n.strip()]
        else:
            ocr_names = raw_input

        final_results = []
        for raw_name in ocr_names:
            clean_raw = normalize_name(raw_name)
            best_match = {"name": raw_name, "role": "미등록/신규", "score": 0, "original": raw_name}
            
            highest_score = 0
            for master in master_data:
                clean_master = normalize_name(master['name'])
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                
                if score > highest_score:
                    highest_score = score
                    if score >= 0.5: # 50% 이상 일치 시 보정
                        best_match = {
                            "name": master['name'], 
                            "role": master['role'], 
                            "score": round(score, 2),
                            "original": raw_name
                        }
            
            final_results.append(best_match)

        # 이름 기준으로 중복 제거
        unique_dict = {res['name']: res for res in final_results}
        return jsonify(list(unique_dict.values()))
    
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# Vercel은 app 객체를 필요로 합니다.
if __name__ == "__main__":
    app.run()
