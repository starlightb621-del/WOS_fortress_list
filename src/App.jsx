import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Trash2, 
  Copy, 
  RefreshCw, 
  Database,
  Settings,
  Clock,
  ChevronLeft,
  UserPlus,
  Plus,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

// --- Styling Constants ---
const THEME = {
  bg: "bg-[#f4faff]",
  card: "bg-white/90 backdrop-blur-xl border border-white shadow-xl shadow-blue-900/5",
  primary: "from-blue-600 to-blue-500",
  textPrimary: "text-blue-600",
  button: "hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
};

const App = () => {
  const [view, setView] = useState('main'); // 'main' | 'admin'
  const [activeTime, setActiveTime] = useState("12시");
  const [scannedData, setScannedData] = useState({ "12시": [], "18시": [], "21시": [] });
  const [masterData, setMasterData] = useState({ members: {} });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "info" });
  const [manualName, setManualName] = useState("");
  const fileInputRef = useRef(null);

  // --- Initial Data Fetch ---
  useEffect(() => {
    fetchMasterList();
    ["12시", "18시", "21시"].forEach(time => fetchParticipation(time));
  }, []);

  const fetchMasterList = async () => {
    try {
      const res = await fetch('/api/master');
      const data = await res.json();
      setMasterData(data);
    } catch (e) {
      showStatus("마스터 명단 로드 실패", "error");
    }
  };

  const fetchParticipation = async (time) => {
    try {
      const res = await fetch(`/api/participation?time=${time}`);
      const data = await res.json();
      setScannedData(prev => ({ ...prev, [time]: data }));
    } catch (e) {
      console.error(`Failed to fetch ${time} participation`);
    }
  };

  const saveParticipation = async (time, list) => {
    try {
      await fetch('/api/participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time, list })
      });
    } catch (e) {
      showStatus("저장 실패", "error");
    }
  };

  const showStatus = (text, type = "info") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg({ text: "", type: "info" }), 3000);
  };

  // --- Core Functions ---
  const handleScan = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setLoading(true);
    showStatus("AI 엔진 분석 중...", "info");

    try {
      const images = await Promise.all(files.map(file => {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
      }));

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Merge results with existing list (deduplicate)
      const newList = [...scannedData[activeTime], ...data.results];
      const uniqueList = Array.from(new Map(newList.map(item => [item.name, item])).values());
      
      // Sort: Type priority, then Name
      const typePriority = { "운영진": 0, "본캐": 1, "부캐": 2, "미등록": 3 };
      uniqueList.sort((a, b) => (typePriority[a.type] || 4) - (typePriority[b.type] || 4) || a.name.localeCompare(b.name, 'ko'));

      const updated = { ...scannedData, [activeTime]: uniqueList };
      setScannedData(updated);
      saveParticipation(activeTime, uniqueList);
      showStatus(`${data.results.length}명 추출 및 자동 보정 완료`, "success");
    } catch (err) {
      showStatus(err.message || "분석 중 오류 발생", "error");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveMaster = async (updatedList) => {
    try {
      const payload = { 
        members: updatedList, 
        last_updated: new Date().toISOString() 
      };
      const res = await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setMasterData(payload);
        showStatus("마스터 명단 저장 완료", "success");
      }
    } catch (e) {
      showStatus("저장 중 오류 발생", "error");
    }
  };

  const handleUpdateMasterEntry = (oldName, field, value) => {
    const newMembers = { ...masterData.members };
    if (field === 'name') {
      const info = newMembers[oldName];
      delete newMembers[oldName];
      newMembers[value] = info;
    } else {
      newMembers[oldName] = { ...newMembers[oldName], [field]: value };
    }
    setMasterData({ ...masterData, members: newMembers });
  };

  const handleAddMasterEntry = () => {
    const newMembers = { 
      "신규 유저": { rank: "R3", type: "본캐" },
      ...masterData.members 
    };
    setMasterData({ ...masterData, members: newMembers });
  };

  const handleDeleteMasterEntry = (name) => {
    if (!window.confirm(`${name}님을 명단에서 삭제하시겠습니까?`)) return;
    const newMembers = { ...masterData.members };
    delete newMembers[name];
    setMasterData({ ...masterData, members: newMembers });
  };

  const handleManualAdd = () => {
    if (!manualName.trim()) return;
    
    // Check if in master list
    const masterInfo = masterData.members[manualName.trim()];
    const newMember = masterInfo 
      ? { name: manualName.trim(), rank: masterInfo.rank, type: masterInfo.type }
      : { name: manualName.trim(), rank: "R3", type: "미등록" };

    const newList = [...scannedData[activeTime], newMember];
    const uniqueList = Array.from(new Map(newList.map(item => [item.name, item])).values());
    
    const updated = { ...scannedData, [activeTime]: uniqueList };
    setScannedData(updated);
    saveParticipation(activeTime, uniqueList);
    setManualName("");
  };

  const handleDelete = (name) => {
    const newList = scannedData[activeTime].filter(m => m.name !== name);
    const updated = { ...scannedData, [activeTime]: newList };
    setScannedData(updated);
    saveParticipation(activeTime, newList);
  };

  const copyToClipboard = () => {
    const list = scannedData[activeTime];
    if (!list.length) return showStatus("복사할 데이터가 없습니다", "error");
    
    const text = list.map((p, i) => `${i + 1}. ${p.name}_${p.type}`).join('\n');
    navigator.clipboard.writeText(text);
    showStatus("클립보드에 복사되었습니다", "success");
  };

  // --- Sub-components ---
  const MainView = () => (
    <div className="w-full max-w-md mx-auto space-y-6 pb-20 px-4">
      {/* Manual Input */}
      <div className={`${THEME.card} rounded-3xl p-4 flex gap-2`}>
        <input 
          type="text" 
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
          placeholder="닉네임 직접 입력..."
          className="flex-1 bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 ring-blue-100"
        />
        <button 
          onClick={handleManualAdd}
          className={`bg-blue-600 text-white px-6 rounded-2xl font-bold text-sm ${THEME.button}`}
        >
          추가
        </button>
      </div>

      {/* Scan Button */}
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={`${THEME.card} rounded-[2rem] p-6 flex flex-col items-center cursor-pointer border-dashed border-2 border-blue-100 hover:bg-blue-50/50 transition-colors group`}
      >
        <input type="file" ref={fileInputRef} multiple onChange={handleScan} className="hidden" />
        <div className={`w-14 h-14 bg-gradient-to-br ${THEME.primary} rounded-2xl flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
          {loading ? <RefreshCw className="text-white animate-spin" /> : <Camera className="text-white" />}
        </div>
        <span className="text-sm font-bold text-slate-700">스샷 여러장 스캔 (자동압축)</span>
        {loading && (
          <div className="w-full mt-4 h-1 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-[loading_2s_infinite]" style={{ width: '40%' }} />
          </div>
        )}
      </div>

      {/* List Area */}
      <div className={`${THEME.card} rounded-[2rem] overflow-hidden`}>
        <div className="p-5 flex justify-between items-center border-b border-slate-50 bg-slate-50/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-700">참여 명단 ({scannedData[activeTime].length}명)</span>
          </div>
          <button 
            onClick={() => fetchParticipation(activeTime)}
            className="p-2 hover:bg-white rounded-full transition-colors"
          >
            <RefreshCw size={14} className="text-slate-400" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto px-4 py-2 space-y-2">
          {scannedData[activeTime].length === 0 ? (
            <div className="py-20 flex flex-col items-center text-slate-300">
              <Database size={40} strokeWidth={1} />
              <p className="text-xs mt-3 font-bold">데이터가 없습니다</p>
            </div>
          ) : (
            scannedData[activeTime].map((p, i) => (
              <div key={p.name} className="flex items-center justify-between p-3 bg-white border border-slate-50 rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-blue-300 w-4">{i + 1}</span>
                  <span className="text-sm font-bold text-slate-700">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    p.type === '운영진' ? 'bg-amber-100 text-amber-600' :
                    p.type === '본캐' ? 'bg-blue-100 text-blue-600' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {p.type}
                  </span>
                  <button onClick={() => handleDelete(p.name)} className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-300 hover:text-rose-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-slate-50/30 border-t border-slate-50">
          <button 
            onClick={copyToClipboard}
            className={`w-full py-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-2xl font-black shadow-lg shadow-blue-200 flex items-center justify-center gap-2 ${THEME.button}`}
          >
            <Copy size={18} /> 명단 복사하기
          </button>
          
          <button 
            onClick={() => setView('admin')}
            className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 hover:text-blue-500 transition-colors"
          >
            <Settings size={14} /> 마스터 명단 확인
          </button>
        </div>
      </div>
    </div>
  );

  const AdminView = () => {
    const members = Object.entries(masterData.members);
    
    return (
      <div className="w-full max-w-2xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-right-4 pb-20">
        <header className="flex items-center justify-between mb-8">
          <button onClick={() => setView('main')} className="p-2 hover:bg-white rounded-xl transition-colors bg-white/50 border border-white shadow-sm">
            <ChevronLeft size={24} className="text-slate-500" />
          </button>
          <div className="text-center">
            <h2 className="text-xl font-black">마스터 명단 관리</h2>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Vercel KV 실시간 연동됨</p>
          </div>
          <button 
            onClick={handleAddMasterEntry}
            className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"
          >
            <UserPlus size={24} />
          </button>
        </header>

        <div className="space-y-3 mb-10">
          {members.map(([name, info], i) => (
            <div key={i} className={`${THEME.card} rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center group`}>
              <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <span className="text-[10px] font-bold text-blue-200 w-6">{i + 1}</span>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => handleUpdateMasterEntry(name, 'name', e.target.value)}
                  className="flex-1 bg-transparent border-none font-black text-slate-700 focus:text-blue-600 outline-none"
                />
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <select 
                  value={info.rank}
                  onChange={(e) => handleUpdateMasterEntry(name, 'rank', e.target.value)}
                  className="flex-1 md:flex-none bg-slate-50 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                >
                  {["R5", "R4", "R3", "R2", "R1"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select 
                  value={info.type}
                  onChange={(e) => handleUpdateMasterEntry(name, 'type', e.target.value)}
                  className="flex-1 md:flex-none bg-slate-50 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                >
                  {["운영진", "본캐", "부캐"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button 
                  onClick={() => handleDeleteMasterEntry(name)}
                  className="p-2 text-rose-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Floating Action Bar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-6">
          <button 
            onClick={() => handleSaveMaster(masterData.members)}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-2xl flex items-center justify-center gap-2 hover:bg-blue-600 transition-all active:scale-[0.98]"
          >
            <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
            변경사항 저장하기
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${THEME.bg} text-slate-800 font-sans selection:bg-blue-100`}>
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[80%] h-[70%] bg-blue-100/40 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-5%] left-[-5%] w-[60%] h-[60%] bg-sky-100/30 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 flex flex-col items-center pt-10 pb-20">
        <header className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-blue-100 shadow-sm mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
            <span className="text-[10px] font-black text-blue-600 tracking-widest uppercase">Cloud Connected</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            WOS 요새쟁탈 <span className="text-blue-600">명단 PRO</span>
          </h1>
        </header>

        {view === 'main' && (
          <nav className="w-full max-w-md bg-white/60 backdrop-blur-xl p-1.5 rounded-[2rem] border border-white shadow-sm mb-8 flex gap-1">
            {["12시", "18시", "21시"].map((time) => (
              <button
                key={time}
                onClick={() => setActiveTime(time)}
                className={`flex-1 py-3 rounded-[1.5rem] text-sm font-black transition-all flex items-center justify-center gap-2 ${
                  activeTime === time 
                    ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-200" 
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Clock size={16} /> {time}
              </button>
            ))}
          </nav>
        )}

        {view === 'main' ? <MainView /> : <AdminView />}

        {/* Global Toast */}
        {statusMsg.text && (
          <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 fade-in ${
            statusMsg.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'
          }`}>
            {statusMsg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-blue-400" />}
            <span className="text-sm font-bold">{statusMsg.text}</span>
          </div>
        )}

        {/* Version Footer */}
        <div className="mt-8 text-[10px] font-bold text-slate-300">
          WOS Fortress Tracker PRO v1.4.0
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading { 
          0% { transform: translateX(-100%); } 
          100% { transform: translateX(250%); } 
        }
      `}} />
    </div>
  );
};

export default App;
