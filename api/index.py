import os
import json
import difflib
import re
from flask import Flask, request, jsonify

app = Flask(__name__)

# [수정] 파일 경로를 절대 경로로 설정하여 에러 방지
BASE_DIR = os.path.dirname(os.path.abspath(__name__))
JSON_PATH = os.path.join(BASE_DIR, 'master_list.json')

def load_master_data():
    try:
        # 파일이 api 폴더 안에 같이 있는 경우
        if os.path.exists(JSON_PATH):
            with open(JSON_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return []

def normalize_name(text):
    if not text: return ""
    text = re.sub(r'\[.*?\]|\(.*?\)', '', text)
    text = re.sub(r'[^가-힣a-zA-Z0-9]', '', text)
    return text.strip()

@app.route('/api/check', methods=['POST'])
def check_attendance():
    try:
        data = request.json
        raw_input = data.get('names', "")
        master_data = load_master_data()
        
        # 1. 입력 텍스트 분리 및 정규화
        ocr_names = [n.strip() for n in re.split(r'[,\n\s]', raw_input) if n.strip()]
        
        final_results = []
        for raw_name in ocr_names:
            clean_raw = normalize_name(raw_name)
            if not clean_raw: continue
            
            best_match = None
            highest_score = 0
            
            for master in master_data:
                clean_master = normalize_name(master['name'])
                score = difflib.SequenceMatcher(None, clean_raw, clean_master).ratio()
                
                if score > highest_score:
                    highest_score = score
                    if score >= 0.4:
                        best_match = {
                            "name": master['name'], 
                            "role": master['role'], 
                            "score": round(score, 2)
                        }
            
            if not best_match:
                best_match = {"name": clean_raw, "role": "신규/미등록", "score": 0}
            final_results.append(best_match)

        # 2. 중복 제거
        seen = set()
        unique_results = []
        for res in final_results:
            if res['name'] not in seen:
                unique_results.append(res)
                seen.add(res['name'])

        # 3. 미참석자 추출
        attended_names = {res['name'] for res in unique_results}
        absent_members = [m for m in master_data if m['name'] not in attended_names]

        return jsonify({
            "count": len(unique_results),
            "members": unique_results,
            "absent_count": len(absent_members),
            "absent_members": absent_members
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run()
