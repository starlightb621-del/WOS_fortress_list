import os
import json
import requests # 외부 JSON 로드를 위해 추가

# 깃허브의 raw 파일 주소 또는 로컬 경로에서 명단 로드
def load_master_data():
    # 1. 우선 같은 폴더의 파일을 시도
    try:
        with open('master_list.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        # 2. 파일이 없으면 기본값 반환 (혹은 깃허브 URL에서 직접 fetch 하도록 확장 가능)
        return []

@app.route('/api/check', methods=['POST'])
def check_attendance():
    master_data = load_master_data()
    # ... (기존 보정 로직) ...
    
    # [추가] 미참석자 추출 로직
    attended_names = {res['name'] for res in unique_results}
    absent_members = [m for m in master_data if m['name'] not in attended_names]
    
    return jsonify({
        "count": len(unique_results),
        "members": unique_results,
        "absent_count": len(absent_members),
        "absent_members": absent_members
    })
