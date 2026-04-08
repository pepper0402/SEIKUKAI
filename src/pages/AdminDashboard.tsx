import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, Profile } from '../lib/supabase'
import StudentDashboard from './StudentDashboard'

// --- 定数・ユーティリティ ---
const allKyuList = [
  '無級', '準10級', '10級', '準9級', '9級', '準8級', '8級', '準7級', '7級', 
  '準6級', '6級', '準5級', '5級', '準4級', '4級', '準3級', '3級', '準2級', '2級', '準1級', '1級', 
  '初段', '弍段', '参段', '四段', '五段'
];

const calculateAge = (birthday: string) => {
  if (!birthday) return 0;
  const normalized = birthday.replace(/\//g, '-').split('T')[0];
  const birthDate = new Date(normalized);
  if (isNaN(birthDate.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
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

export default function AdminDashboard({ profile: adminProfile }: { profile: Profile }) {
  const [students, setStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('すべて')
  const [sortBy, setSortBy] = useState<'name' | 'kyu'>('name')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_admin', false)
    setStudents(data || [])
  }, [])

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

      {/* サイドバー */}
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
          <EvaluationPanel key={selectedStudent.id} student={selectedStudent} onRefresh={() => { loadStudents(); setSelectedStudent(null); }} allBranchList={allBranchList} />
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
  // 誕生日の読み込みを確実にする
  const getInitialBirthday = () => {
    if (!student.birthday) return '';
    return student.birthday.split('T')[0].replace(/\//g, '-');
  };

  const [formData, setFormData] = useState({ 
    ...student, 
    birthday: getInitialBirthday() 
  });
  const [loading, setLoading] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').update({
      name: formData.name,
      kyu: formData.kyu,
      branch: formData.branch,
      birthday: formData.birthday,
    }).eq('id', student.id);
    
    if (error) alert(error.message);
    else { alert('更新しました'); onRefresh(); onClose(); }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('退会処理を行いますか？この生徒の全データが削除されます。')) return;
    setLoading(true);
    const { error } = await supabase.from('profiles').delete().eq('id', student.id);
    if (error) alert(error.message);
    else { alert('退会処理を完了しました'); onRefresh(); onClose(); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#001f3f]/90 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 font-black text-gray-400 hover:text-black">✕</button>
        <h2 className="text-xl font-black italic mb-6 uppercase">会員詳細変更</h2>
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">氏名</label>
            <input type="text" className="w-full bg-gray-50 border-none rounded-2xl px-4 py-3 text-sm outline-none font-bold" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">現在の級</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold outline-none" value={formData.kyu} onChange={e => setFormData({...formData, kyu: e.target.value})}>
                {allKyuList.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-gray-400 uppercase ml-2">所属支部</label>
              <select className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm font-bold outline-none" value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})}>
                {allBranchList.map((b:string) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase ml-2">生年月日</label>
            <input type="date" className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm outline-none font-bold" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
          </div>
          <div className="pt-2 space-y-2">
            <button type="submit" disabled={loading} className="w-full py-4 bg-[#001f3f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all">保存する</button>
            <button type="button" onClick={handleDelete} className="w-full py-3 text-red-500 font-black text-[10px] uppercase tracking-widest hover:bg-red-50 rounded-2xl transition-all">退会させる</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EvaluationPanel({ student, onRefresh, allBranchList }: any) {
  const [showEdit, setShowEdit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const age = useMemo(() => calculateAge(student.birthday), [student.birthday]);
  const isGeneral = age >= 15;
  const [criteria, setCriteria] = useState<any[]>([])

  const targetBelt = useMemo(() => {
    const k = student.kyu || '無級';
    if (k === '無級' || k === '準10級') return '白帯';
    if (k.match(/10|9/)) return '黄帯';
    if (k.match(/8|7/)) return '青帯';
    if (k.match(/6|5/)) return isGeneral ? '紫帯' : '橙帯';
    if (k.match(/4|3/)) return '緑帯';
    if (k.includes('1') || k.includes('2')) return '茶帯';
    return '黒帯';
  }, [student.kyu, isGeneral]);

  const dbBeltName = (targetBelt === '橙帯' || targetBelt === '紫帯') ? '橙帯/紫帯' : targetBelt;
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

  const handlePromote = async () => {
    const currentIdx = allKyuList.indexOf(student.kyu || '無級');
    const nextKyu = allKyuList[currentIdx + 1];
    if (!nextKyu || !window.confirm(`${nextKyu}への昇級を確定しますか？`)) return;
    const { error } = await supabase.from('profiles').update({ kyu: nextKyu }).eq('id', student.id);
    if (!error) { alert(`${nextKyu}に昇級しました！`); onRefresh(); }
  };

  const belts = isGeneral 
    ? ['白帯', '黄帯', '青帯', '紫帯', '緑帯', '茶帯', '黒帯'] 
    : ['白帯', '黄帯', '青帯', '橙帯', '緑帯', '茶帯', '黒帯'];

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="bg-[#001f3f] rounded-[40px] p-6 md:p-8 text-white mb-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex justify-between items-center">
          <div className="flex-1">
            <h2 className="text-3xl font-black mb-4 leading-tight">{student.name}</h2>
            <div className="flex gap-6 items-center">
              <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">CURRENT</p><p className="text-xl font-black text-orange-400">{student.kyu || '無級'}</p></div>
              <div className="h-8 w-[1px] bg-white/10"></div>
              <div><p className="text-[10px] font-black text-white/40 uppercase mb-1">{isGeneral ? '一般' : 'キッズ'}</p><p className="text-xl font-black">{targetBelt}</p></div>
            </div>
          </div>
          <div className="text-right min-w-[120px]">
            <p className="text-[10px] font-black text-white/40 mb-1 uppercase tracking-widest">SCORE</p>
            <p className={`text-6xl md:text-7xl font-black leading-none ${isScoreReady ? 'text-green-400' : 'text-white'}`}>{totalScore.toFixed(0)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
          <button onClick={handlePromote} className={`py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${isScoreReady ? 'bg-orange-500 text-white shadow-lg' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>昇級を確定する</button>
          <button onClick={() => setShowEdit(true)} className="py-3.5 bg-white/20 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white/30 transition-all">詳細変更・退会</button>
        </div>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {belts.map(b => {
              const tabKey = (b === '橙帯' || b === '紫帯') ? '橙帯/紫帯' : b;
              const isSelected = viewBelt === tabKey;
              return (
                <button key={b} onClick={() => setViewBelt(tabKey)} className={`px-4 py-2 rounded-xl text-[10px] font-black whitespace-nowrap border-2 transition-all ${isSelected ? `${getBeltColorClass(b)} shadow-md scale-105` : 'bg-white text-gray-400 border-transparent hover:border-gray-100'}`}>{b}</button>
              )
            })}
          </div>
          <button onClick={() => setShowPreview(true)} className="shrink-0 px-6 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-orange-500/20 active:scale-95 transition-all">Preview</button>
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
