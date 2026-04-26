# 📋 WOS 요새쟁탈 명단 PRO: 프로젝트 상세서

### 1. 프로젝트 개요
* **목적**: WOS 요새쟁탈전 참여 스크린샷을 분석하여 참여자 명단을 자동 정산하고 관리함.
* **핵심 가치**: Gemini 2.5의 고성능 OCR과 Redis(Vercel KV)의 실시간성을 결합한 데이터 무결성 확보.
* **UI 테마**: **White & Blue Ice** (Glassmorphism 적용).

### 2. 기술 스택 및 인프라 현황
* **Frontend**: HTML5, Tailwind CSS, JavaScript (Vercel 배포).
* **Backend**: Python 3.x (Flask / Vercel Serverless Functions).
* **AI Engine**: **Gemini 2.5 Flash** (이미지 분석 및 닉네임 추출).
* **Database**: **Vercel KV (Redis)** - 프로젝트명: `redis-fulvous-lever`.
* **환경 변수 (Vercel)**:
    * `REDIS_URL`: Redis 연결 주소 (All Environments).
    * `GEMINI_API_KEY`: Gemini API 인증 키 (Production, Preview 전용).

### 3. 데이터 관리 정책
* **Master Data**: `master_list.json` (GitHub 보관).
    * *주의: 이 파일은 백업 및 초기 세팅용이며, 실제 서비스 로직은 KV 데이터를 우선함.*
* **Active Data**: Vercel KV에 저장된 유저 정보 및 직책 데이터.
* **보정 로직**: 
    1.  연맹 태그(`[ ]`, `( )`) 제거 정규식 적용.
    2.  유사 문자 치환 테이블 적용 (예: 0→O, 1→I).
    3.  Fuzzy Matching(유사도 분석)을 통한 마스터 명단 매칭.

### 4. 파일 구조 및 배포 설정
```
/
├── api/
│   └── index.py       # Flask 기반 API 서버 로직
├── index.html         # 메인 프론트엔드 페이지
├── requirements.txt   # Python 의존성 관리 (Flask)
├── vercel.json        # Vercel 라우팅 및 리라이트 설정
└── README.md          # 프로젝트 설명서
```

---

## 🔍 추가 검토 및 확인 필요 사항 (To-Do List)

협업자가 작업을 이어받을 때 반드시 확인해야 할 **4가지 핵심 체크리스트**입니다.

### 1. 로컬 개발 환경 동기화 (Environment Sync)
* **이슈**: 현재 Vercel 상의 `GEMINI_API_KEY`가 Development 환경에는 할당되지 않았을 수 있습니다.
* **확인 사항**: 로컬 터미널에서 `vercel env pull .env.local` 명령어를 실행하여 로컬 환경에서도 API와 DB가 정상 작동하는지 확인이 필요합니다. 배포버전 작동에 특별히 문제가 없다면 그대로 진행하시면 됩니다.

### 2. Redis 데이터 초기 적재 (Seed Data)
* **이슈**: `redis-fulvous-lever` 인스턴스는 생성되었으나, `master_list.json`의 내용이 KV에 실제로 `SET` 되어 있는지 확인이 필요합니다.
* **확인 사항**: Vercel Storage 대시보드의 **Data Browser**를 열어 유저 데이터가 JSON 형태로 들어가 있는지 확인하세요. 이미 저장되어 있습니다.

### 3. Gemini 2.5 API 모델 식별자 확인
* **이슈**: 상세서에는 2.5 버전으로 확정되었으나, Google AI Studio에서 제공하는 정확한 모델 코드명(예: `gemini-2.5-flash-latest` 등)을 코드에 명시했는지 확인해야 합니다. 1.5 버전은 지원종료되었으니 버전을 낮추지마세요. 1.5 버전 사용금지. 1.5 버전은 404 에러 발생함.
* **확인 사항**: `api/index.py` 내의 모델 호출 선언부를 점검하세요.

### 4. 동시성 및 레이트 리밋(Rate Limit) 대응
* **이슈**: 요새전 직후 여러 운영진이 동시에 스크린샷을 업로드할 경우 Vercel KV의 무료 플랜(Hobby) 대역폭이나 Gemini API의 분당 호출 제한에 걸릴 수 있습니다. 소수인원만 사용하기 때문에 가능성이 낮음.
* **확인 사항**: 
    * 이미지 업로드 시 "분석 중..." 애니메이션을 통해 중복 클릭을 방지했는가?
    * API 오류 발생 시 사용자에게 친절한 에러 메시지를 노출하는가?

---

### 6. 향후 개선 과제 (Roadmap)
* **6.1. 클라이언트 사이드 OCR 도입**: 서버 부하를 줄이기 위해 `Tesseract.js`를 도입하여 브라우저 내 이미지 분석 검토.
* **6.2. 마스터 명단 관리 기능**: 사용자가 웹 UI에서 직접 마스터 명단을 수정하고 저장할 수 있는 기능 추가 예정.
* **6.3. 데이터 유지 (Persistence)**: 새로고침 시 데이터 휘발 방지를 위해 `localStorage` 연동 또는 DB 연결 강화.

### 7. 협업 시 주의사항
* **API 경로**: Vercel 환경에서는 모든 호출을 `/api/...` 경로로 통일.

---
**최종 수정일**: 2026. 04. 26
**작성자**: Gemini 3 Flash PRO Project Team
