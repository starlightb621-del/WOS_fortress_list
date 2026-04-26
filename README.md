# 🚀 WOS 요새쟁탈 명단 PRO (v1.4.0)

AI(Gemini)와 실시간 DB(Vercel KV)를 활용하여 화이트아웃 서바이벌(WOS) 게임의 요새전 참여 인원을 단 5초 만에 정산하는 자동화 시스템입니다.

## ✨ 주요 기능
- **AI OCR 스캔**: 여러 장의 스크린샷에서 닉네임을 추출하고 자동으로 인식합니다. (Gemini 2.5 Flash 엔진 탑재)
- **지능형 닉네임 보정**: 오타나 특수문자가 섞인 닉네임을 마스터 명단과 대조하여 정확한 이름으로 보정합니다.
- **실시간 마스터 명단 관리**: 웹 UI에서 직접 연맹원의 이름, 등급(R1~R5), 직책(운영진/본캐/부캐)을 편집하고 Vercel KV에 저장합니다.
- **원클릭 명단 복사**: 정산된 명단을 카카오톡이나 공지에 바로 붙여넣을 수 있는 포맷으로 복사합니다.

## 🛠 기술 스택
- **Frontend**: Vite + React, Tailwind CSS, Lucide Icons
- **Backend**: Python (Flask) on Vercel Serverless
- **AI Engine**: Google Gemini 2.5 Flash
- **Database**: Vercel KV (Redis)

## ⚙️ 설정 방법 (Environment Variables)
Vercel 배포 시 아래 환경 변수를 설정해야 합니다.
- `GEMINI_API_KEY`: Google AI Studio에서 발급받은 API 키
- `REDIS_URL`: Vercel KV (Redis) 연결 정보

## 📄 라이선스
Created by 판다곰 (1953 GOM Alliance)
Technical Support by Antigravity (Google Deepmind)
