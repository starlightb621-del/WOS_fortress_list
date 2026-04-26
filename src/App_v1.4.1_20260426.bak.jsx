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
  CheckCircle2,
  X
} from 'lucide-react';

// --- Styling Constants ---
const THEME = {
  bg: "bg-[#f4faff]",
  card: "bg-white/90 backdrop-blur-xl border border-white shadow-xl shadow-blue-900/5",
  primary: "from-blue-600 to-blue-500",
  textPrimary: "text-blue-600",
  button: "hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
};

// --- Custom Modal Component ---
const Modal = ({ isOpen, onClose, title, message, children, confirmText = "확인", cancelText = "취소", onConfirm, type = "info" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl rounded-[2.5rem] p-8 shadow-2xl border border-white animate-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
            type === 'danger' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'
          }`}>
            {type === 'danger' ? <AlertCircle size={28} /> : <CheckCircle2 size={28} />}
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2 tracking-tight">{title}</h3>
          <p className="text-sm font-bold text-slate-500 leading-relaxed mb-8">{message}</p>
          
          {children && <div className="w-full mb-8">{children}</div>}
          
          <div className="flex gap-3 w-full">
            <button 
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => { onConfirm(); onClose(); }}
              className={`flex-1 py-4 rounded-2xl font-black text-sm text-white shadow-lg transition-all active:scale-95 ${
                type === 'danger' ? 'bg-rose-500 shadow-rose-200 hover:bg-rose-600' : 'bg-blue-600 shadow-blue-200 hover:bg-blue-700'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---
const MainView = ({ 
  activeTime, 
  scannedData, 
  loading, 
  fileInputRef, 
  handleScan, 
  manualName, 
  setManualName, 
  handleManualAdd, 
  openResetModal, 
  fetchParticipation, 
  openDeleteModal, 
  copyToClipboard, 
  setView 
}) => (
  <div className="w-full max-w-md mx-auto space-y-5 pb-20 px-4">
    <div 
      onClick={() => fileInputRef.current?.click()}
      className={`${THEME.card} rounded-[2rem] p-8 flex flex-col items-center cursor-pointer border-dashed border-2 border-blue-100 hover:bg-blue-50/50 transition-all group`}
    >
      <input type="file" ref={fileInputRef} multiple onChange={handleScan} className="hidden" />
      <div className={`w-16 h-16 bg-gradient-to-br ${THEME.primary} rounded-2xl flex items-center justify-center mb-4 shadow-xl group-hover:scale-110 transition-transform`}>
        {loading ? <RefreshCw className="text-white animate-spin" /> : <Camera size={28} className="text-white" />}
      </div>
      <span className="text-base font-black text-slate-800 tracking-tight">스크린샷을 첨부해주세요</span>
      <p className="text-[11px] text-slate-400 mt-2 font-medium tracking-tight">여러 장을 한 번에 선택하여 스캔하세요</p>
      {loading && (
        <div className="w-full mt-5 h-1.5 bg-blue-50 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 animate-[loading_2s_infinite]" style={{ width: '45%' }} />
        </div>
      )}
    </div>

    <form onSubmit={handleManualAdd} className={`${THEME.card} rounded-[1.5rem] p-3 flex gap-2 shadow-sm`}>
      <input 
        type="text" 
        value={manualName}
        onChange={(e) => setManualName(e.target.value)}
        placeholder="추가할 닉네임 직접 입력..."
        className="flex-1 bg-slate-50/50 border-none rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 ring-blue-100 placeholder:text-slate-300"
      />
      <button type="submit" className={`bg-slate-900 text-white px-6 rounded-xl font-black text-sm ${THEME.button}`}>추가</button>
    </form>

    <div className={`${THEME.card} rounded-[2rem] overflow-hidden shadow-2xl shadow-blue-900/5`}>
      <div className="p-5 flex justify-between items-center border-b border-slate-50 bg-slate-50/30">
        <span className="text-[13px] font-black text-slate-800 uppercase tracking-tight">참여 명단 ({scannedData[activeTime].length}명)</span>
        <div className="flex items-center gap-1">
          <button onClick={openResetModal} className="flex items-center gap-1 px-3 py-2 hover:bg-white rounded-xl transition-colors group text-[12px] font-bold" title="초기화">
            <Trash2 size={14} className="text-slate-300 group-hover:text-rose-500" />
            <span className="text-slate-400 group-hover:text-rose-500">초기화</span>
          </button>
          <button onClick={() => fetchParticipation(activeTime)} className="p-2 hover:bg-white rounded-full transition-colors group" title="새로고침">
            <RefreshCw size={14} className="text-slate-300 group-hover:text-blue-500" />
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto px-4 py-3 space-y-2.5">
        {scannedData[activeTime].length === 0 ? (
          <div className="py-20 flex flex-col items-center text-slate-200">
            <Database size={48} strokeWidth={1} />
            <p className="text-[11px] mt-4 font-black text-slate-300">스캔된 데이터가 없습니다</p>
          </div>
        ) : (
          scannedData[activeTime].map((p, i) => (
            <div key={`p-${p.name}`} className="flex items-center justify-between p-3.5 bg-white border border-slate-50 rounded-2xl shadow-sm hover:border-blue-100 transition-colors animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-blue-200 w-5">{i + 1}</span>
                <span className="text-[14px] font-black text-slate-700">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                  p.type === '운영진' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                  p.type === '본캐' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                  'bg-slate-50 text-slate-400 border border-slate-100'
                }`}>
                  {p.type}
                </span>
                <button onClick={() => openDeleteModal(p.name)} className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-200 hover:text-rose-500 transition-colors">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-6 bg-slate-50/50 border-t border-slate-50">
        <button onClick={copyToClipboard} className={`w-full py-3.5 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-2xl font-black shadow-xl shadow-blue-200 flex items-center justify-center gap-2.5 ${THEME.button}`}>
          <Copy size={18} /> 명단 복사하기
        </button>
        <button onClick={() => setView('admin')} className="w-full mt-4 flex items-center justify-center gap-1.5 text-[13px] font-black text-slate-500 hover:text-blue-600 transition-colors">
          <Settings size={16} /> 마스터 명단 확인
        </button>
      </div>
    </div>
  </div>
);

const AdminView = ({ 
  masterData, 
  setView, 
  openAddMasterModal, 
  handleUpdateMasterEntry, 
  openDeleteMasterModal, 
  handleSaveMaster 
}) => {
  const rankPriority = { "R5": 0, "R4": 1, "R3": 2, "R2": 3, "R1": 4 };
  const members = Object.entries(masterData.members).sort((a, b) => {
    const aRank = a[1].rank?.toUpperCase() || "R1";
    const bRank = b[1].rank?.toUpperCase() || "R1";
    const rankDiff = (rankPriority[aRank] ?? 5) - (rankPriority[bRank] ?? 5);
    if (rankDiff !== 0) return rankDiff;
    return a[0].localeCompare(b[0], 'ko');
  });
  
  return (
    <div className="w-full max-w-2xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-right-4 pb-20">
      <header className="flex items-center justify-between mb-8">
        <button onClick={() => setView('main')} className="p-2 hover:bg-white rounded-xl transition-colors bg-white/50 border border-white shadow-sm">
          <ChevronLeft size={24} className="text-slate-500" />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-black tracking-tight">마스터 명단 관리</h2>
        </div>
        <button onClick={openAddMasterModal} className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 hover:bg-blue-700 transition-colors">
          <UserPlus size={24} />
        </button>
      </header>

      <div className="space-y-3 mb-12">
        {members.map(([name, info], i) => (
          <div key={`member-${i}`} className={`${THEME.card} rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center group border-transparent hover:border-blue-100 transition-all`}>
            <div className="flex items-center gap-3 w-full md:w-auto flex-1">
              <span className="text-[10px] font-black text-blue-200 w-6">{i + 1}</span>
              <input 
                type="text" 
                value={name}
                onChange={(e) => handleUpdateMasterEntry(name, 'name', e.target.value)}
                className="flex-1 bg-transparent border-none font-black text-slate-700 focus:text-blue-600 outline-none text-[15px]"
              />
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <select value={info.rank} onChange={(e) => handleUpdateMasterEntry(name, 'rank', e.target.value)} className="flex-1 md:flex-none bg-slate-50/80 border-none rounded-xl px-3 py-2 text-[11px] font-black outline-none cursor-pointer">
                {["R5", "R4", "R3", "R2", "R1"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={info.type} onChange={(e) => handleUpdateMasterEntry(name, 'type', e.target.value)} className="flex-1 md:flex-none bg-slate-50/80 border-none rounded-xl px-3 py-2 text-[11px] font-black outline-none cursor-pointer">
                {["운영진", "본캐", "부캐"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={() => openDeleteMasterModal(name)} className="p-2 text-rose-200 hover:text-rose-500 transition-colors"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-50">
        <button onClick={() => handleSaveMaster(masterData.members)} className="w-full py-4.5 bg-slate-900 text-white rounded-[1.5rem] font-black shadow-2xl flex items-center justify-center gap-3 hover:bg-blue-600 transition-all active:scale-[0.98]">
          <RefreshCw size={18} /><span>변경사항 저장하기</span>
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState('main');
  const [activeTime, setActiveTime] = useState("12시");
  const [scannedData, setScannedData] = useState({ "12시": [], "18시": [], "21시": [] });
  const [masterData, setMasterData] = useState({ members: {} });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "info" });
  const [manualName, setManualName] = useState("");
  const fileInputRef = useRef(null);

  // Modal State
  const [modal, setModal] = useState({ isOpen: false, type: 'info', title: '', message: '', onConfirm: () => {}, children: null });
  const [newMasterNickname, setNewMasterNickname] = useState("");

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
      const sorted = sortParticipationList(data);
      setScannedData(prev => ({ ...prev, [time]: sorted }));
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
      const uniqueList = Array.from(new Map([...scannedData[activeTime], ...data.results].map(item => [item.name, item])).values());
      const sortedList = sortParticipationList(uniqueList);
      const updated = { ...scannedData, [activeTime]: sortedList };
      setScannedData(updated);
      saveParticipation(activeTime, sortedList);
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
      const payload = { members: updatedList, last_updated: new Date().toISOString() };
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

  // --- Modal Specific Functions ---
  const openResetModal = () => {
    setModal({
      isOpen: true,
      type: 'danger',
      title: '명단 초기화',
      message: `${activeTime} 참여 명단을 정말로 초기화하시겠습니까?`,
      onConfirm: () => {
        const updated = { ...scannedData, [activeTime]: [] };
        setScannedData(updated);
        saveParticipation(activeTime, []);
        showStatus(`${activeTime} 명단이 초기화되었습니다`, "success");
      }
    });
  };

  const openDeleteModal = (name) => {
    setModal({
      isOpen: true,
      type: 'danger',
      title: '참여자 삭제',
      message: `${name}님을 참여 명단에서 삭제하시겠습니까?`,
      onConfirm: () => {
        const newList = scannedData[activeTime].filter(m => m.name !== name);
        const updated = { ...scannedData, [activeTime]: newList };
        setScannedData(updated);
        saveParticipation(activeTime, newList);
      }
    });
  };

  const openDeleteMasterModal = (name) => {
    setModal({
      isOpen: true,
      type: 'danger',
      title: '마스터 삭제',
      message: `${name}님을 마스터 명단에서 삭제하시겠습니까?`,
      onConfirm: () => {
        const newMembers = { ...masterData.members };
        delete newMembers[name];
        setMasterData({ ...masterData, members: newMembers });
      }
    });
  };

  const openAddMasterModal = () => {
    setNewMasterNickname("");
    setModal({
      isOpen: true,
      type: 'info',
      title: '신규 유저 추가',
      message: '마스터 명단에 추가할 닉네임을 입력해주세요.',
      onConfirm: () => {
        // This will be handled by the nickname state
      },
      children: (
        <input 
          id="new-nickname-input"
          type="text" 
          autoFocus
          placeholder="닉네임 입력..."
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all text-center"
          onChange={(e) => setNewMasterNickname(e.target.value)}
        />
      )
    });
  };

  // Handle Add Master from Modal
  useEffect(() => {
    if (modal.isOpen && modal.title === '신규 유저 추가') {
      setModal(prev => ({
        ...prev,
        onConfirm: () => {
          const nickname = document.getElementById('new-nickname-input')?.value || newMasterNickname;
          if (!nickname.trim()) return showStatus("닉네임을 입력해주세요", "error");
          const newMembers = { 
            [nickname.trim()]: { rank: "R3", type: "본캐" },
            ...masterData.members 
          };
          setMasterData({ ...masterData, members: newMembers });
          showStatus(`${nickname}님이 마스터 명단에 추가되었습니다 (저장 필요)`, "success");
        }
      }));
    }
  }, [newMasterNickname, modal.isOpen, modal.title]);

  const handleManualAdd = (e) => {
    if (e) e.preventDefault();
    const trimmedName = manualName.trim();
    if (!trimmedName) return;
    if (scannedData[activeTime].some(m => m.name === trimmedName)) {
      showStatus("이미 추가된 이름입니다", "info");
      setManualName("");
      return;
    }
    const masterInfo = masterData.members[trimmedName];
    const newMember = masterInfo 
      ? { name: trimmedName, rank: masterInfo.rank, type: masterInfo.type }
      : { name: trimmedName, rank: "R3", type: "미등록" };
    const uniqueList = Array.from(new Map([...scannedData[activeTime], newMember].map(item => [item.name, item])).values());
    const sortedList = sortParticipationList(uniqueList);
    const updated = { ...scannedData, [activeTime]: sortedList };
    setScannedData(updated);
    saveParticipation(activeTime, sortedList);
    setManualName("");
    showStatus(`${trimmedName}님 추가 완료`, "success");
  };

  const sortParticipationList = (list) => {
    const typePriority = { "운영진": 0, "본캐": 1, "부캐": 2, "미등록": 3 };
    return [...list].sort((a, b) => (typePriority[a.type] ?? 4) - (typePriority[b.type] ?? 4) || a.name.localeCompare(b.name, 'ko'));
  };

  const copyToClipboard = () => {
    const list = scannedData[activeTime];
    if (!list.length) return showStatus("복사할 데이터가 없습니다", "error");
    const header = `[${activeTime} 요새쟁탈 참여자 최종명단]\n\n`;
    const text = header + list.map((p, i) => `${i + 1}. ${p.name}_${p.type}`).join('\n');
    navigator.clipboard.writeText(text);
    showStatus("클립보드에 복사되었습니다", "success");
  };

  return (
    <div className={`min-h-screen ${THEME.bg} text-slate-800 font-sans selection:bg-blue-100`}>
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
            <span className="ml-2 text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-md align-middle font-bold">v1.4.1</span>
          </h1>
        </header>

        {view === 'main' && (
          <nav className="w-full max-w-md bg-white/60 backdrop-blur-xl p-1.5 rounded-[2rem] border border-white shadow-sm mb-8 flex gap-1">
            {["12시", "18시", "21시"].map((time) => (
              <button key={time} onClick={() => setActiveTime(time)} className={`flex-1 py-3 rounded-[1.5rem] text-sm font-black transition-all flex items-center justify-center gap-2 ${activeTime === time ? "bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-200" : "text-slate-400 hover:text-slate-600"}`}>
                <Clock size={16} /> {time}
              </button>
            ))}
          </nav>
        )}

        {view === 'main' ? (
          <MainView activeTime={activeTime} scannedData={scannedData} loading={loading} fileInputRef={fileInputRef} handleScan={handleScan} manualName={manualName} setManualName={setManualName} handleManualAdd={handleManualAdd} openResetModal={openResetModal} fetchParticipation={fetchParticipation} openDeleteModal={openDeleteModal} copyToClipboard={copyToClipboard} setView={setView} />
        ) : (
          <AdminView masterData={masterData} setView={setView} openAddMasterModal={openAddMasterModal} handleUpdateMasterEntry={handleUpdateMasterEntry} openDeleteMasterModal={openDeleteMasterModal} handleSaveMaster={handleSaveMaster} />
        )}

        <Modal isOpen={modal.isOpen} onClose={() => setModal({ ...modal, isOpen: false })} title={modal.title} message={modal.message} onConfirm={modal.onConfirm} type={modal.type} children={modal.children} />

        {statusMsg.text && (
          <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-10 fade-in ${statusMsg.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
            {statusMsg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} className="text-blue-400" />}
            <span className="text-sm font-bold">{statusMsg.text}</span>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      `}} />
    </div>
  );
};

export default App;
