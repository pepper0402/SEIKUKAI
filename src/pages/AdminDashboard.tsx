import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- ユーティリティ ---
const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

const calculateAge = (birthdayStr: any) => {
  if (!birthdayStr || birthdayStr === "") return 0;
  try {
    const datePart = String(birthdayStr).split('T')[0].replace(/\//g, '-');
    const birthDate = new Date(datePart);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  } catch (e) { return 0; }
};

const calculateExperience = (createdAt: any) => {
  if (!createdAt) return "不明";
  try {
    const start = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    if (years === 0) return `${months}ヶ月`;
    return `${years}年${months}ヶ月`;
  } catch (e) { return "不明"; }
};

const getBeltColorClass = (beltName: string) => {
  switch (beltName) {
    case '白帯': return 'bg-gray-100 text-gray-600 border-gray-200';
    case '黄帯': return 'bg-yellow-400 text-yellow-900 border-yellow-500';
    case '青帯': return 'bg-blue-600 text-white border-blue-700';
    case '橙帯': return 'bg-orange-500 text-white border-orange-600';
    case '紫帯': return 'bg-purple-600 text-white border-purple-700';
    case '緑帯': return 'bg-green-600 text-white border-green-700';
    case '茶帯': return 'bg-[#5D4037] text-white border-[#3E2723]';
    case '黒帯': return 'bg-black text-white border-gray-800';
    default: return 'bg-white text-gray-400 border-gray-100';
  }
};

const getRawColorCode = (beltName: string) => {
  switch (beltName) {
    case '白帯': return '#ccc';
    case '黄帯': return '#fbbf24';
    case '青帯': return '#2563eb';
    case '橙帯': return '#f97316';
    case '紫帯': return '#9333ea';
    case '緑帯': return '#16a34a';
    case '茶帯': return '#5d4037';
    case '黒帯': return '#000';
    default: return 'transparent';
  }
};

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    if (data) {
      setStudents(data);
      if (selectedStudent) {
        const updated = data.find(s => s.id === selectedStudent.id);
        if (updated) setSelectedStudent({ ...updated }); 
      }
    }
  }, [selectedStudent])

  useEffect(() => {
    loadStudents()
    if (window.innerWidth < 768) setIsSidebarOpen(false)
  }, [loadStudents])

  const allBranchList = useMemo(() => {
    const branches = students.map(s => (s as any).branch).filter(Boolean)
    return Array.from(new Set(['池田', '川西', '宝塚', ...branches])).sort()
  }, [students])

  const filteredStudents = useMemo(() => {
    let result = students.filter(s => {
      const k = (s.name || '') + (s.kyu || '') + ((s as any).branch || '')
      return k.toLowerCase().includes(searchQuery.toLowerCase()) && 
             (branchFilter === 'すべて' || (s as any).branch === branchFilter)
    });
    return result.sort((a, b) => {
      if (sortBy === 'kyu') {
        return allKyuList.indexOf(b.kyu || '無級') - allKyuList.indexOf(a.kyu || '無級');
      }
      return (a.name || '').localeCompare(b.name || '', 'ja');
    });
  }, [students, searchQuery, branchFilter, sortBy])

  return (
    <div className="flex h-screen bg-[#f0f2f5] overflow-hidden font-sans text-[#001f3f]">
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 bg-[#001f3f] text-white p-3 rounded-full shadow-2xl md:hidden">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      )}

      <div className={`fixed inset-y-0 left-0 z-40 w-80 bg-white border-r border-gray-200 flex flex-col shadow-xl transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
        <div className="p-6 bg-[#001f3f] text-white">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-lg font-black italic uppercase leading-none">誠空会 管理パネル</h1>
            <button onClick={() => supabase.auth.signOut()} className="text-[10px] bg-red-600 px-3 py-1.5 rounded-lg font-black uppercase">Logout</button>
          </div>
          <div className="space-y-2">
            <input type="text" placeholder="名前・級で検索..." className="w-full bg-white/10 border-none rounded-xl px-4 py-2 text-xs text-white outline-none focus:bg-white focus:text-[#001f3f]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="flex gap-1">
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="すべて" className="text-black">全支部</option>
                {allBranchList.map(b => <option key={b} value={b} className="text-black">{b}</option>)}
              </select>
              <select className="flex-1 bg-white/10 rounded-xl px-2 py-2 text-[9px] font-black outline-none" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="name" className="text-black">名前順</option>
                <option value="kyu" className="text-black">級順</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredStudents.map(s => (
            <div key={s.id} onClick={() => {setSelectedStudent(s); if(window.innerWidth<768)setIsSidebarOpen(false);}} className={`p-5 border-l-4 cursor-pointer transition-all ${selectedStudent?.id === s.id ? 'bg-orange-50 border-orange-500 shadow-inner' : 'border-transparent hover:bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-black text-sm">{s.name}</p>
                  <p className="text-[9px] font-bold text-orange-500 uppercase">{s.kyu}</p>
                </div>
                <span className="text-[8px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">{(s as any).branch}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 md:p-10 pt-16 md:pt-10">
        {selectedStudent ? (
          <EvaluationPanel 
            /* ここが重要：keyにIDを渡すことで、別の人を選んだ時にコンポーネントを強制リセットします */
            key={selectedStudent.id} 
            student={selectedStudent} 
            onRefresh={loadStudents} 
            allBranchList={allBranchList} 
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
             <h2 className="font-black text-4xl italic tracking-tighter uppercase">SEIKUKAI</h2>
          </div>
        )}
      </div>
    </div>
  )
}

function EditStudentModal({ student, allBranchList, onClose, onRefresh }: any) {
  const getSafeDate = (val: any) => {
    if (!val) return "";
    return String(val).split('T')[0].replace(/\//g, '-');
  };

  const [formData, setFormData] = useState({ 
    ...student, 
    birthday: getSafeDate(student.birthday) 
  });
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name: formData.name,
      kyu: formData.kyu,
      branch: formData.branch,
      birthday: formData.birthday || null,
    }).eq('id', student.id);
    
    if (error) alert(error.message);
    else { onRefresh(); onClose(); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 font-black text-gray-400">✕</button>
        <h2 className="text-xl font-black italic mb-6 uppercase tracking-tight">会員詳細変更</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">氏名</label>
            <input type="text" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">現在の級</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.kyu || '無級'} onChange={e => setFormData({...formData, kyu: e.target.value})}>
                {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">所属支部</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.branch || ''} onChange={e => setFormData({...formData, branch: e.target.value})}>
                {allBranchList.map((b:string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">生年月日</label>
            <input type="date" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold border-none outline-none" value={formData.birthday || ''} onChange={e => setFormData({...formData, birthday: e.target.value})} />
          </div>
          <div className="pt-2">
            <button type="submit" disabled={loading} className="w-full py-4 bg-[#001f3f] text-white rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all">保存する</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [criteria, setCriteria] = useState<any[]>([])

  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const experience = useMemo(() => calculateExperience(student.created_at), [student.created_at]);
  
  const isGeneral = age >= 15;
  const sectionLabel = isGeneral ? "一般部" : "キッズ";
  const sectionColorClass = isGeneral ? "bg-rose-500 text-white" : "bg-sky-400 text-[#001f3f]";

  const currentBelt = useMemo(() => {
    const k = student.kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return isGeneral ? '紫帯' : '橙帯';
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }, [student.kyu, isGeneral]);

  const dbBeltName = (currentBelt === '橙帯' || currentBelt === '紫帯') ? '橙帯/紫帯' : currentBelt;
  const [viewBelt, setViewBelt] = useState(dbBeltName);

  useEffect(() => {
    async function fetchEvals() {
      const { data: crit } = await supabase.from('criteria').select('*').eq('dan', viewBelt).order('id')
      const { data: evals } = await supabase.from('evaluations').select('*').eq('student_id', student.id)
      setCriteria((crit || []).map(c => {
        const existing = evals?.find(e => e.criterion_id === c.id);
        return { ...c, grade: existing ? existing.grade : 'D' };
      }))
    }
    fetchEvals()
  }, [student.id, viewBelt])

  const totalScore = criteria.reduce((acc, curr) => acc + (curr.grade === 'A' ? 2.5 : curr.grade === 'B' ? 1.5 : curr.grade === 'C' ? 0.5 : 0), 0)
  const isScoreReady = totalScore >= 80

  const handlePromote = async (step: number = 1) => {
    const currentIdx = allKyuList.indexOf(student.kyu || '無級');
    const nextIdx = currentIdx + step;
    const nextKyu = allKyuList[nextIdx];
    if (!nextKyu || !window.confirm(`${nextKyu}へ昇級を確定しますか？`)) return;
    await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    onRefresh();
  };

  const belts = isGeneral 
    ? ['白帯', '黄帯', '青帯', '紫帯', '緑帯', '茶帯', '黒帯'] 
    : ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯'];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-6 md:p-8 text-white mb-8 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap justify-between items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-3xl font-black mb-4 leading-tight tracking-tighter">{student.name}</h2>
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase mb-1">GRADE</p>
                <p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p>
              </div>
              <div className="h-8 w-[1px] bg-white/10"></div>
              <div>
                <span className={`inline-block px-3 py-0.5 rounded-full text-[10px] font-black uppercase mb-1 ${sectionColorClass}`}>
                  {sectionLabel}
                </span>
                <p className="text-xl font-black">{currentBelt}</p>
              </div>
              <div className="h-8 w-[1px] bg-white/10"></div>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase mb-1">修行年数</p>
                <p className="text-xl font-black">{experience}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">TOTAL SCORE</p>
            <p className={`text-6xl md:text-7xl font-black leading-none ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore.toFixed(0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8 relative z-10">
          <button onClick={() => handlePromote(1)} className={`py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${isScoreReady ? 'bg-orange-500 text-white shadow-lg' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>昇級確定</button>
          <button onClick={() => handlePromote(2)} className={`py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${isScoreReady ? 'bg-orange-600 text-white shadow-lg' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>1級飛び級</button>
          <button onClick={() => setShowEdit(true)} className="py-4 bg-white/20 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white/30 transition-all md:col-span-1">データ修正</button>
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {belts.map(b => {
              const tabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
              const isSelected = viewBelt === tabKey;
              return (
                <button 
                  key={b} 
                  onClick={() => setViewBelt(tabKey)} 
                  className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap border-2 transition-all 
                    ${isSelected 
                      ? `${getBeltColorClass(b)} shadow-md scale-105` 
                      : `bg-white text-gray-400 border-gray-100 hover:border-gray-300`
                    }`}
                  style={!isSelected ? { 
                    borderLeftColor: getRawColorCode(b), 
                    borderLeftWidth: '4px' 
                  } : {}}
                >
                  {b}
                </button>
              )
            })}
          </div>
          <button onClick={() => setShowPreview(true)} className="shrink-0 px-6 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg active:scale-95 transition-all">Preview</button>
        </div>
      </div>

      <div className="space-y-4">
        {criteria.map(c => (
          <div key={c.id} className="bg-white p-5 md:p-6 rounded-[35px] shadow-sm border border-gray-100">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <span className="text-[9px] font-black text-gray-300 uppercase mb-1 block">{c.examination_type}</span>
                <p className="text-sm font-bold text-[#001f3f] leading-snug">{c.examination_content}</p>
              </div>
              {c.video_url && (
                <a href={c.video_url} target="_blank" rel="noreferrer" className="w-8 h-8 flex items-center justify-center bg-gray-50 text-orange-500 rounded-lg border border-gray-100 text-xs">▶️</a>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['A', 'B', 'C', 'D'].map(g => (
                <button key={g} onClick={() => {
                  const newGrade = g;
                  setCriteria(prev => prev.map(item => item.id === c.id ? { ...item, grade: newGrade } : item));
                  supabase.from('evaluations').upsert({ student_id: student.id, criterion_id: c.id, grade: newGrade }, { onConflict: 'student_id,criterion_id' }).then();
                }} className={`py-3 rounded-xl font-black transition-all ${c.grade === g ? 'bg-[#001f3f] text-white shadow-lg' : 'bg-gray-50 text-gray-300 hover:bg-gray-100'}`}>{g}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showEdit && <EditStudentModal student={student} allBranchList={allBranchList} onClose={() => setShowEdit(false)} onRefresh={onRefresh} />}
      {showPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#001f3f]/95 backdrop-blur-md">
          <div className="relative w-full max-w-md h-[90vh] overflow-hidden rounded-[50px] bg-white shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="absolute top-6 right-6 z-[120] w-10 h-10 bg-black text-white rounded-full font-black">✕</button>
            <div className="h-full overflow-y-auto"><StudentDashboard profile={student} /></div>
          </div>
        </div>
      )}
    </div>
  )
}
