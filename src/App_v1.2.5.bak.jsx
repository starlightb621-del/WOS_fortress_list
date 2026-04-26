import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Trash2, 
  Copy, 
  ShieldCheck, 
  RefreshCw, 
  Database,
  Settings,
  Clock,
  ChevronLeft,
  Save,
  UserPlus,
  ArrowRight
} from 'lucide-react';

// --- 설정 (Configuration) ---
const CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/AKfycbxcCpXhhu8_ZDW0BaJEtzVkNvJ1K7biHOhdGkba3Eds4h5UDoXEvY9vToE5B_8tezD8/exec",
  SHEET_URL: "https://docs.google.com/spreadsheets/d/1ZowRVfk0S10Hscv_cLQOWdTgRPH7YIKTLPhvjYOp0Q0/edit?usp=sharing",
  API_KEY: import.meta.env.VITE_GEMINI_API_KEY || "", 
  MODEL_NAME: "gemini-2.5-flash" 
};

const App = () => {
  const [view, setView] = useState('main'); // 'main' | 'admin'
  const [masterList, setMasterList] = useState([]);
  const [scannedData, setScannedData] = useState({ "12시": [], "18시": [], "21시": [] });
  const [activeTime, setActiveTime] = useState("12시");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", grade: "R3", role: "본캐" });
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(CONFIG.GAS_URL);
      const data = await response.json();
      setMasterList(data);
    } catch (e) {
      console.error("데이터 동기화 실패");
    } finally {
      setIsSyncing(false);
    }
  };

  const updateMasterData = async (payload) => {
    setIsSyncing(true);
    try {
      await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        // headers: { "Content-Type": "application/json" }, // CORS 오류 방지를 위해 제거
        body: JSON.stringify(payload)
      });
      if (payload.action === undefined) { // 전체 업데이트 시에만 메시지 표시
        setStatusMsg("데이터 동기화 완료");
      }
    } catch (e) {
      setStatusMsg("연동 실패");
    } finally {
      setIsSyncing(false);
      setTimeout(() => setStatusMsg(""), 2000);
    }
  };

  const rolePriority = { "운영진": 1, "본캐": 2, "부캐": 3 };

  const runAI = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setLoading(true);
    setStatusMsg("명단 추출 중...");
    
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
            contents: [{
              parts: [
                { text: "이미지에서 연맹원 닉네임을 모두 추출하여 JSON 형식으로 반환해줘. 결과값은 반드시 {\"names\": [\"닉네임1\", \"닉네임2\"]} 형태로 받도록 강제하여 프로그램이 바로 읽을 수 있게 함." },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
              ]
            }]
          })
        });

        const resData = await response.json();
        const aiText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.names && Array.isArray(parsed.names)) {
              allExtractedNames = [...allExtractedNames, ...parsed.names];
            }
          } catch (e) {
            console.error("AI 응답 파싱 실패:", e);
          }
        }
      }

      // --- 데이터 정제 로직 ---
      const cleanStr = (str) => str.replace(/[^가-힣a-zA-Z0-9]/g, '').trim();

      const processed = allExtractedNames.map(rawName => {
        const name = rawName.trim();
        const cleanedExtracted = cleanStr(name);
        
        // 1. 마스터 리스트에서 유사도 매칭 (포함 관계 확인)
        // 마스터 리스트의 이름과 추출된 이름의 정제된 버전을 비교
        const match = masterList.find(m => {
          const cleanedMaster = cleanStr(m.name);
          return (
            cleanedExtracted.includes(cleanedMaster) || 
            cleanedMaster.includes(cleanedExtracted) ||
            name.includes(m.name) ||
            m.name.includes(name)
          );
        });

        if (match) {
          return { ...match }; // 마스터 정보 사용 (이름, 역할, 등급 등)
        } else {
          return { name: name, grade: "R3", role: "본캐" }; // 신규 유저
        }
      });

      setScannedData(prev => {
        const currentList = [...prev[activeTime], ...processed];
        
        // 중복 제거 (이름 기준) 및 정렬
        const uniqueList = [];
        const seenNames = new Set();

        for (const item of currentList) {
          if (!seenNames.has(item.name)) {
            uniqueList.push(item);
            seenNames.add(item.name);
          }
        }

        uniqueList.sort((a, b) => {
          const pA = rolePriority[a.role] || 99;
          const pB = rolePriority[b.role] || 99;
          if (pA !== pB) return pA - pB;
          return a.name.localeCompare(b.name, 'ko');
        });

        return { ...prev, [activeTime]: uniqueList };
      });

      setStatusMsg("추출 완료!");
    } catch (err) {
      setStatusMsg("오류 발생");
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  const copyToClipboard = () => {
    const list = scannedData[activeTime];
    const text = `[${activeTime} 요새전 참여명단]\n` + list.map((p, i) => `${i+1}. ${p.name} (${p.role})`).join('\n');
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  // --- 관리자 모드 관련 함수 ---
  const handleEditMaster = (index, field, value) => {
    const newList = [...masterList];
    newList[index][field] = value;
    setMasterList(newList);
    // 즉시 부분 업데이트 전송
    updateMasterData({
      action: "updateCell",
      rowIndex: index,
      field: field,
      value: value
    });
  };

  const addMasterEntry = () => {
    if (!newMember.name.trim()) return alert("이름을 입력해주세요.");
    
    setMasterList([...masterList, newMember]);
    updateMasterData({ action: "addRow", ...newMember });
    
    setNewMember({ name: "", grade: "R3", role: "본캐" });
    setIsAddModalOpen(false);
  };

  const deleteMasterEntry = (index) => {
    if(window.confirm(`${masterList[index].name} 유저를 삭제하시겠습니까?`)) {
      setMasterList(masterList.filter((_, i) => i !== index));
      updateMasterData({ action: "deleteRow", rowIndex: index });
    }
  };

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-white text-slate-800 flex flex-col p-6 font-sans">
        <header className="flex items-center justify-between mb-8">
          <button onClick={() => setView('main')} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500">
            <ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-black text-slate-900">마스터 명단 관리 <span className="text-[10px] text-blue-400 font-bold ml-1">v1.2.5</span></h2>
          <div className="w-[100px]"></div> {/* 밸런스를 위한 더미 */}
        </header>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          <div className="flex justify-between items-center px-2">
            <span className="text-xs font-bold text-slate-400">전체 인원: {masterList.length}명</span>
            <button 
              onClick={() => setIsAddModalOpen(true)} 
              className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-black shadow-lg shadow-blue-100 hover:scale-105 transition-transform"
            >
              <UserPlus size={14} /> 유저 추가
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scroll border border-slate-100 rounded-3xl p-2 bg-slate-50/50">
            {masterList.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-2xl mb-2 shadow-sm">
                <span className="text-[10px] font-bold text-slate-300 w-6">{i + 1}</span>
                <input 
                  value={m.name} 
                  onChange={(e) => handleEditMaster(i, 'name', e.target.value)}
                  className="flex-1 text-sm font-black text-slate-700 bg-transparent outline-none focus:text-blue-600"
                />
                <select 
                  value={m.grade || "R3"} 
                  onChange={(e) => handleEditMaster(i, 'grade', e.target.value)}
                  className="text-xs font-bold p-1.5 rounded-lg bg-blue-50 border-none outline-none text-blue-600"
                >
                  {["R5", "R4", "R3", "R2", "R1"].map(g => <option key={g}>{g}</option>)}
                </select>
                <select 
                  value={m.role} 
                  onChange={(e) => handleEditMaster(i, 'role', e.target.value)}
                  className="text-xs font-bold p-1.5 rounded-lg bg-slate-50 border-none outline-none"
                >
                  <option>운영진</option>
                  <option>본캐</option>
                  <option>부캐</option>
                </select>
                <button onClick={() => deleteMasterEntry(i)} className="text-rose-400 p-2">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        
        {/* 추가 팝업 모달 */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={() => setIsAddModalOpen(false)} />
            <div className="relative bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-slide-up">
              <h3 className="text-xl font-black text-slate-900 mb-6">새 연맹원 추가</h3>
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">닉네임</label>
                  <input 
                    autoFocus
                    value={newMember.name}
                    onChange={(e) => setNewMember({...newMember, name: e.target.value})}
                    placeholder="인게임 닉네임 입력"
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-black outline-none focus:ring-2 ring-blue-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">등급</label>
                    <select 
                      value={newMember.grade}
                      onChange={(e) => setNewMember({...newMember, grade: e.target.value})}
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-4 text-sm font-black outline-none"
                    >
                      {["R5", "R4", "R3", "R2", "R1"].map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">분류</label>
                    <select 
                      value={newMember.role}
                      onChange={(e) => setNewMember({...newMember, role: e.target.value})}
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-4 text-sm font-black outline-none"
                    >
                      <option>운영진</option>
                      <option>본캐</option>
                      <option>부캐</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm">취소</button>
                  <button onClick={addMasterEntry} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-blue-200">추가하기</button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <footer className="mt-6 text-center">
          <a href={CONFIG.SHEET_URL} target="_blank" rel="noreferrer" className="text-[10px] text-slate-400 underline flex items-center justify-center gap-1">
            원본 구글 시트에서 열기 <ArrowRight size={10}/>
          </a>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f9ff] text-slate-800 flex flex-col items-center p-4 font-sans relative">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[70%] h-[60%] bg-blue-200/30 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[50%] h-[50%] bg-sky-100/50 blur-[100px] rounded-full" />
      </div>

      <header className="w-full max-w-lg flex flex-col items-center mb-6 relative z-10">
        <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-white/80 border border-blue-200 shadow-sm mb-4">
          <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-blue-500 shadow-sm'}`} />
          <span className="text-[10px] font-black text-blue-600 tracking-widest uppercase">
            {isSyncing ? '동기화 중...' : '데이터 연결됨'}
          </span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-none">
          WOS 요새쟁탈 <span className="text-blue-600">명단작성 PRO</span>
          <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full ml-2 align-middle">v1.2.5</span>
        </h1>
      </header>

      <nav className="w-full max-w-lg flex bg-white/60 backdrop-blur-xl p-1.5 rounded-3xl border border-white shadow-sm mb-6 relative z-10">
        {["12시", "18시", "21시"].map((time) => (
          <button
            key={time}
            onClick={() => setActiveTime(time)}
            className={`flex-1 py-3 rounded-2xl text-sm font-black transition-all duration-300 flex items-center justify-center gap-2 ${
              activeTime === time ? "bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg" : "text-slate-400"
            }`}
          >
            <Clock size={16} /> {time}
          </button>
        ))}
      </nav>

      <main className="w-full max-w-lg space-y-6 relative z-10">
        <div 
          onClick={() => fileInputRef.current.click()}
          className="group bg-white/70 backdrop-blur-2xl rounded-[2rem] border border-white shadow-[0_15px_40px_rgba(186,230,253,0.3)] p-8 flex flex-col items-center cursor-pointer hover:shadow-xl transition-all"
        >
          <input type="file" ref={fileInputRef} multiple onChange={runAI} className="hidden" />
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-sky-300 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform">
            {loading ? <RefreshCw className="text-white animate-spin" /> : <Camera className="text-white" />}
          </div>
          <h2 className="text-lg font-black text-slate-800">스크린샷 스캔</h2>
          <p className="text-xs text-slate-400 mt-1 font-bold">참여 명단 이미지를 올려주세요</p>
          {loading && (
            <div className="w-full mt-6 h-1 bg-blue-50 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 animate-loading-bar" style={{ width: '40%' }} />
            </div>
          )}
        </div>

        <div className="bg-white/80 backdrop-blur-2xl rounded-[2rem] border border-white shadow-xl overflow-hidden">
          <div className="p-5 border-b border-blue-50 flex justify-between items-center bg-blue-50/20">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-blue-500" />
              <span className="text-xs font-black text-slate-700 uppercase">참여 명단 ({scannedData[activeTime].length}명)</span>
            </div>
            <button 
              onClick={() => setScannedData(prev => ({...prev, [activeTime]: []}))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-500 transition-colors"
            >
              <Trash2 size={14} />
              <span className="text-[11px] font-black">초기화</span>
            </button>
          </div>

          <div className="max-h-[350px] overflow-y-auto px-4 py-2 custom-scroll">
            {scannedData[activeTime].length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center opacity-20">
                <ShieldCheck size={48} />
                <p className="text-xs mt-3 font-black tracking-widest uppercase">No Data Found</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {scannedData[activeTime].map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 bg-white border border-blue-50 rounded-2xl animate-slide-up shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-[10px] font-black text-blue-300 w-4">{i + 1}</span>
                      <span className="text-sm font-black text-slate-800 truncate max-w-[120px]">{p.name}</span>
                    </div>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${
                      p.role === '운영진' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                      p.role === '본캐' ? 'bg-blue-50 border-blue-200 text-blue-600' :
                      'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {p.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 space-y-4 bg-blue-50/20 border-t border-blue-50 flex flex-col items-center">
            {statusMsg && (
              <div className="text-center py-1 text-xs font-bold text-blue-500 animate-pulse">{statusMsg}</div>
            )}
            <button 
              onClick={copyToClipboard}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.97] transition-all font-black"
            >
              <Copy size={18} />
              참여 명단 복사하기
            </button>
            
            <div 
              onClick={() => setView('admin')}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-600 cursor-pointer transition-colors py-1 group"
            >
              <Settings size={14} className="group-hover:rotate-45 transition-transform duration-300" />
              <span className="text-[11px] font-black uppercase tracking-wider">명단 관리</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-10 flex flex-col items-center gap-3 opacity-30 relative z-10 text-center">
        <div className="w-12 h-1 bg-blue-200 rounded-full" />
        <p className="text-[10px] font-black tracking-[0.2em] text-blue-900 uppercase">
          1953 GOM 연맹 created by 판다곰
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading-bar { 0% { left: -40%; } 100% { left: 100%; } }
        .animate-loading-bar { position: relative; animation: loading-bar 2s infinite ease-in-out; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.4s ease forwards; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
};

export default App;
