import React, { useState, useEffect, useRef } from 'react';
import { Camera, Trash2, Copy, ShieldCheck, RefreshCw, Database, Settings, Clock, ChevronLeft, Save, UserPlus, ArrowRight, CheckCircle2 } from 'lucide-react';

// --- 설정 (사용자 정보 입력) ---
const CONFIG = {
  GAS_URL: "YOUR_GAS_DEPLOYMENT_URL", // 1단계 GAS 배포 후 생성된 URL
  API_KEY: "AIzaSyCFYQu5FBCEXhc0OLonW8EfaMwGMJLLvbo",    // Gemini API 키
  MODEL_NAME: "gemini-1.5-flash"      // 안정적인 모델명
};

const App = () => {
  const [view, setView] = useState('main'); 
  const [masterList, setMasterList] = useState([]);
  const [scannedData, setScannedData] = useState({ "12시": [], "18시": [], "21시": [] });
  const [activeTime, setActiveTime] = useState("12시");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchMasterData(); }, []);

  // 마스터 명단 가져오기
  const fetchMasterData = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(CONFIG.GAS_URL);
      const data = await response.json();
      setMasterList(data);
    } catch (e) { console.error("데이터 로드 실패"); }
    finally { setIsSyncing(false); }
  };

  // 구글 시트에 실시간 자동 저장 (참여현황 탭)
  const syncToSheet = async (updatedScannedData) => {
    setIsSyncing(true);
    try {
      await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(updatedScannedData)
      });
      setStatusMsg("시트 동기화 완료");
    } catch (e) {
      setStatusMsg("동기화 실패");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setStatusMsg(""), 2000);
    }
  };

  // 유사도 기반 자동 보정 알고리즘 (Levenshtein Distance)
  const getSimilarity = (s1, s2) => {
    const len1 = s1.length, len2 = s2.length;
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    return 1 - matrix[len1][len2] / Math.max(len1, len2);
  };

  const runAI = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setLoading(true);
    setStatusMsg("명단 분석 중...");
    
    let allExtractedNames = [];
    try {
      for (let file of files) {
        const base64Data = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.MODEL_NAME}:generateContent?key=${CONFIG.API_KEY}`;
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: "추출된 닉네임들을 JSON 배열 형식으로 반환해줘: {\"names\": [\"닉네임1\", \"닉네임2\"]}" },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]}]
          })
        });

        const resData = await response.json();
        const aiText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = aiText.match(/\{.*\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.names) allExtractedNames = [...allExtractedNames, ...parsed.names];
        }
      }

      // 보정 로직 적용
      const processed = allExtractedNames.map(rawName => {
        const cleanName = rawName.trim();
        let bestMatch = { name: cleanName, role: "본캐", score: 0 };

        masterList.forEach(m => {
          const score = getSimilarity(cleanName, m.name);
          if (score > bestMatch.score && score > 0.6) { // 60% 이상 유사할 때 보정
            bestMatch = { ...m, score };
          }
        });
        return bestMatch;
      });

      // 기존 명단과 합치기 및 중복 제거
      setScannedData(prev => {
        const currentList = [...prev[activeTime], ...processed];
        const uniqueList = currentList.filter((item, index, self) =>
          index === self.findIndex((t) => t.name === item.name)
        ).sort((a, b) => (a.role === '운영진' ? -1 : 1));
        
        const nextData = { ...prev, [activeTime]: uniqueList };
        syncToSheet(nextData); // 실시간 시트 저장
        return nextData;
      });

    } catch (err) { setStatusMsg("분석 오류"); } 
    finally { setLoading(false); }
  };

  const copyToClipboard = () => {
    const list = scannedData[activeTime];
    const text = `[${activeTime} 요새전 참여명단]\n` + list.map((p, i) => `${i+1}. ${p.name} (${p.role})`).join('\n');
    navigator.clipboard.writeText(text);
    setStatusMsg("클립보드 복사 완료!");
    setTimeout(() => setStatusMsg(""), 2000);
  };

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex flex-col p-6 font-sans">
        <header className="flex items-center justify-between mb-8">
          <button onClick={() => setView('main')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronLeft size={24} /></button>
          <h2 className="text-xl font-black text-slate-900">마스터 명단 (조회용)</h2>
          <div className="w-10" />
        </header>
        <div className="flex-1 overflow-y-auto space-y-2">
          {masterList.map((m, i) => (
            <div key={i} className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold">{m.name}</span>
              <span className="text-xs text-blue-500 font-black">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f9ff] text-slate-800 flex flex-col items-center p-4 font-sans relative overflow-x-hidden">
      {/* 배경 장식 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[70%] h-[60%] bg-blue-200/30 blur-[120px] rounded-full" />
      </div>

      <header className="w-full max-w-lg flex flex-col items-center mb-6 relative z-10">
        <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-white/80 border border-blue-200 shadow-sm mb-4">
          <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-blue-500'}`} />
          <span className="text-[10px] font-black text-blue-600 tracking-widest uppercase">
            {isSyncing ? 'SYNCING...' : 'CLOUD CONNECTED'}
          </span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-none">
          WOS 요새쟁탈 <span className="text-blue-600">명단 PRO</span>
        </h1>
      </header>

      <nav className="w-full max-w-lg flex bg-white/60 backdrop-blur-xl p-1.5 rounded-3xl border border-white shadow-sm mb-6 relative z-10">
        {["12시", "18시", "21시"].map((time) => (
          <button key={time} onClick={() => setActiveTime(time)} className={`flex-1 py-3 rounded-2xl text-sm font-black transition-all ${activeTime === time ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg" : "text-slate-400"}`}>
            <Clock size={16} className="inline mr-1" /> {time}
          </button>
        ))}
      </nav>

      <main className="w-full max-w-lg space-y-6 relative z-10">
        <div onClick={() => fileInputRef.current.click()} className="bg-white/70 backdrop-blur-2xl rounded-[2rem] border border-white shadow-xl p-8 flex flex-col items-center cursor-pointer hover:scale-[1.02] transition-all">
          <input type="file" ref={fileInputRef} multiple onChange={runAI} className="hidden" />
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-sky-300 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            {loading ? <RefreshCw className="text-white animate-spin" /> : <Camera className="text-white" />}
          </div>
          <h2 className="text-lg font-black text-slate-800">스크린샷 추가 스캔</h2>
          <p className="text-xs text-slate-400 mt-1 font-bold">여러 장 선택 가능 • 실시간 자동 저장</p>
        </div>

        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white shadow-xl overflow-hidden">
          <div className="p-5 border-b border-blue-50 flex justify-between items-center bg-blue-50/20">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-blue-500" />
              <span className="text-xs font-black text-slate-700 uppercase">참여 명단 ({scannedData[activeTime].length}명)</span>
            </div>
            {statusMsg && <div className="text-[10px] font-bold text-blue-600 flex items-center gap-1 animate-bounce"><CheckCircle2 size={12}/> {statusMsg}</div>}
          </div>

          <div className="max-h-[350px] overflow-y-auto px-4 py-2 custom-scroll">
            {scannedData[activeTime].length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center opacity-20">
                <ShieldCheck size={48} /><p className="text-xs mt-3 font-black">데이터가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {scannedData[activeTime].map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 bg-white border border-blue-50 rounded-2xl shadow-sm">
                    <span className="text-[10px] font-black text-blue-300 w-4">{i + 1}</span>
                    <span className="flex-1 text-sm font-black text-slate-800 ml-2">{p.name}</span>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full ${p.role === '운영진' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{p.role}</span>
                    <button onClick={() => {
                      const filtered = scannedData[activeTime].filter((_, idx) => idx !== i);
                      const next = {...scannedData, [activeTime]: filtered};
                      setScannedData(next);
                      syncToSheet(next);
                    }} className="ml-2 text-slate-300 hover:text-rose-500"><Trash2 size={14}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 bg-blue-50/20 border-t border-blue-50 space-y-3">
            <button onClick={copyToClipboard} className="w-full py-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg font-black active:scale-95 transition-all">
              <Copy size={18} /> 명단 복사하기
            </button>
            <div onClick={() => setView('admin')} className="text-center text-[11px] font-black text-blue-400 cursor-pointer hover:text-blue-600 flex items-center justify-center gap-1">
              <Settings size={12} /> 마스터 명단 확인
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-8 text-center opacity-30">
        <p className="text-[10px] font-black tracking-widest text-blue-900 uppercase">1953 GOM ALLIANCE PRO</p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
};

export default App;
